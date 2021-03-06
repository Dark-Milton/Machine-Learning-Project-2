import { PathExt, URLExt } from '@jupyterlab/coreutils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Poll } from '@lumino/polling';
import { Signal } from '@lumino/signaling';
import { requestAPI } from './git';
import { TaskHandler } from './taskhandler';
import { Git } from './tokens';
import { decodeStage } from './utils';
// Default refresh interval (in milliseconds) for polling the current Git status (NOTE: this value should be the same value as in the plugin settings schema):
const DEFAULT_REFRESH_INTERVAL = 3000; // ms
// Available diff providers
const DIFF_PROVIDERS = {};
/**
 * Get the diff provider for a filename
 * @param filename Filename to look for
 * @returns The diff provider callback or undefined
 */
export function getDiffProvider(filename) {
    var _a, _b;
    return (_b = DIFF_PROVIDERS[(_a = PathExt.extname(filename)) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase()]) === null || _b === void 0 ? void 0 : _b.callback;
}
/**
 * Class for creating a model for retrieving info from, and interacting with, a remote Git repository.
 */
export class GitExtension {
    /**
     * Returns an extension model.
     *
     * @param app - frontend application
     * @param settings - plugin settings
     * @returns extension model
     */
    constructor(docmanager = null, docRegistry = null, settings) {
        /**
         * Fetch poll action.
         */
        this._fetchRemotes = async () => {
            try {
                const path = await this._getPathRepository();
                await requestAPI(URLExt.join(path, 'remote', 'fetch'), 'POST');
            }
            catch (error) {
                console.error('Failed to fetch remotes', error);
            }
        };
        /**
         * Refresh model status through a Poll
         */
        this._refreshModel = async () => {
            await this._taskHandler.execute('git:refresh', async () => {
                try {
                    await this.refreshBranch();
                    await this.refreshStatus();
                    await this.checkRemoteChangeNotified();
                }
                catch (error) {
                    console.error('Failed to refresh git status', error);
                }
            });
        };
        /**
         * Standby test function for the refresh Poll
         *
         * Standby refresh if
         * - webpage is hidden
         * - not in a git repository
         * - standby condition is true
         *
         * @returns The test function
         */
        this._refreshStandby = () => {
            if (this.pathRepository === null || this._standbyCondition()) {
                return true;
            }
            return 'when-hidden';
        };
        this._pathRepository = null;
        this._branches = [];
        this._currentBranch = null;
        this._isDisposed = false;
        this._markerCache = new Markers(() => this._markChanged.emit());
        this.__currentMarker = null;
        this._readyPromise = Promise.resolve();
        this._pendingReadyPromise = 0;
        this._standbyCondition = () => false;
        this._remoteChangedFiles = [];
        this._changeUpstreamNotified = [];
        this._selectedHistoryFile = null;
        this._headChanged = new Signal(this);
        this._markChanged = new Signal(this);
        this._selectedHistoryFileChanged = new Signal(this);
        this._repositoryChanged = new Signal(this);
        this._statusChanged = new Signal(this);
        this._notifyRemoteChanges = new Signal(this);
        this._docmanager = docmanager;
        this._docRegistry = docRegistry;
        this._settings = settings || null;
        this._taskHandler = new TaskHandler(this);
        // Initialize repository status
        this._clearStatus();
        let interval;
        if (settings) {
            interval = settings.composite.refreshInterval;
            settings.changed.connect(this._onSettingsChange, this);
        }
        else {
            interval = DEFAULT_REFRESH_INTERVAL;
        }
        this._statusPoll = new Poll({
            factory: this._refreshModel,
            frequency: {
                interval: interval,
                backoff: true,
                max: 300 * 1000
            },
            standby: this._refreshStandby
        });
        this._fetchPoll = new Poll({
            auto: false,
            factory: this._fetchRemotes,
            frequency: {
                interval,
                backoff: true,
                max: 300 * 1000
            },
            standby: this._refreshStandby
        });
    }
    /**
     * Branch list for the current repository.
     */
    get branches() {
        return this._branches;
    }
    /**
     * The current repository branch.
     */
    get currentBranch() {
        return this._currentBranch;
    }
    /**
     * Boolean indicating whether the model has been disposed.
     */
    get isDisposed() {
        return this._isDisposed;
    }
    /**
     * Boolean indicating whether the model is ready.
     */
    get isReady() {
        return this._pendingReadyPromise === 0;
    }
    /**
     * Promise which fulfills when the model is ready.
     */
    get ready() {
        return this._readyPromise;
    }
    /**
     * Git repository path.
     *
     * ## Notes
     *
     * -   This is the full path of the top-level folder.
     * -   The return value is `null` if a repository path is not defined.
     */
    get pathRepository() {
        return this._pathRepository;
    }
    set pathRepository(v) {
        const change = {
            name: 'pathRepository',
            newValue: null,
            oldValue: this._pathRepository
        };
        if (v === null) {
            this._pendingReadyPromise += 1;
            this._readyPromise.then(() => {
                this._pathRepository = null;
                this._pendingReadyPromise -= 1;
                if (change.newValue !== change.oldValue) {
                    this.refresh().then(() => this._repositoryChanged.emit(change));
                }
            });
        }
        else {
            const currentReady = this._readyPromise;
            this._pendingReadyPromise += 1;
            const currentFolder = v;
            this._readyPromise = Promise.all([
                currentReady,
                this.showPrefix(currentFolder)
            ])
                .then(([_, path]) => {
                if (path !== null) {
                    // Remove relative path to get the Git repository root path
                    path = currentFolder.slice(0, Math.max(0, currentFolder.length - path.length));
                }
                change.newValue = this._pathRepository = path;
                if (change.newValue !== change.oldValue) {
                    this.refresh().then(() => this._repositoryChanged.emit(change));
                }
                this._pendingReadyPromise -= 1;
            })
                .catch(reason => {
                this._pendingReadyPromise -= 1;
                console.error(`Fail to find Git top level for path ${currentFolder}.\n${reason}`);
            });
        }
    }
    /**
     * Custom model refresh standby condition
     */
    get refreshStandbyCondition() {
        return this._standbyCondition;
    }
    set refreshStandbyCondition(v) {
        this._standbyCondition = v;
    }
    /**
     * Selected file for single file history
     */
    get selectedHistoryFile() {
        return this._selectedHistoryFile;
    }
    set selectedHistoryFile(file) {
        if (this._selectedHistoryFile !== file) {
            this._selectedHistoryFile = file;
            this._selectedHistoryFileChanged.emit(file);
        }
    }
    /**
     * Git repository status
     */
    get status() {
        return this._status;
    }
    /**
     * A signal emitted when the `HEAD` of the Git repository changes.
     */
    get headChanged() {
        return this._headChanged;
    }
    /**
     * A signal emitted when the current marking of the Git repository changes.
     */
    get markChanged() {
        return this._markChanged;
    }
    /**
     * A signal emitted when the current file selected for history of the Git repository changes.
     */
    get selectedHistoryFileChanged() {
        return this._selectedHistoryFileChanged;
    }
    /**
     * A signal emitted when the current Git repository changes.
     */
    get repositoryChanged() {
        return this._repositoryChanged;
    }
    /**
     * A signal emitted when the current status of the Git repository changes.
     */
    get statusChanged() {
        return this._statusChanged;
    }
    /**
     * A signal emitted whenever a model event occurs.
     */
    get taskChanged() {
        return this._taskHandler.taskChanged;
    }
    /**
     * A signal emitted when the current Git repository changes.
     */
    get notifyRemoteChanges() {
        return this._notifyRemoteChanges;
    }
    /**
     * Get the current markers
     *
     * Note: This makes sure it always returns non null value
     */
    get _currentMarker() {
        if (!this.__currentMarker) {
            this._setMarker(this.pathRepository, this._currentBranch ? this._currentBranch.name : '');
        }
        return this.__currentMarker;
    }
    /**
     * Add one or more files to the repository staging area.
     *
     * ## Notes
     *
     * -   If no filename is provided, all files are added.
     *
     * @param filename - files to add
     * @returns promise which resolves upon adding files to the repository staging area
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async add(...filename) {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:add:files', async () => {
            await requestAPI(URLExt.join(path, 'add'), 'POST', {
                add_all: !filename,
                filename: filename || ''
            });
        });
        await this.refreshStatus();
    }
    /**
     * Match files status information based on a provided file path.
     *
     * If the file is tracked and has no changes, a StatusFile of unmodified will be returned.
     *
     * @param path the file path relative to the server root
     * @returns The file status or null if path repository is null or path not in repository
     */
    getFile(path) {
        if (this.pathRepository === null) {
            return null;
        }
        const fileStatus = this._status.files.find(status => {
            return this.getRelativeFilePath(status.to) === path;
        });
        if (!fileStatus) {
            const relativePath = PathExt.relative('/' + this.pathRepository, '/' + path);
            if (relativePath.startsWith('../')) {
                return null;
            }
            else {
                return {
                    x: '',
                    y: '',
                    to: relativePath,
                    from: '',
                    is_binary: null,
                    status: 'unmodified',
                    type: this._resolveFileType(path)
                };
            }
        }
        else {
            return fileStatus;
        }
    }
    /**
     * Add all "unstaged" files to the repository staging area.
     *
     * @returns promise which resolves upon adding files to the repository staging area
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async addAllUnstaged() {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:add:files:all_unstaged', async () => {
            await requestAPI(URLExt.join(path, 'add_all_unstaged'), 'POST');
        });
        await this.refreshStatus();
    }
    /**
     * Add all untracked files to the repository staging area.
     *
     * @returns promise which resolves upon adding files to the repository staging area
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async addAllUntracked() {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:add:files:all_untracked', async () => {
            await requestAPI(URLExt.join(path, 'add_all_untracked'), 'POST');
        });
        await this.refreshStatus();
    }
    /**
     * Add a remote Git repository to the current repository.
     *
     * @param url - remote repository URL
     * @param name - remote name
     * @returns promise which resolves upon adding a remote
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async addRemote(url, name) {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:add:remote', async () => {
            await requestAPI(URLExt.join(path, 'remote', 'add'), 'POST', {
                url,
                name
            });
        });
    }
    /**
     * Retrieve the repository commit log.
     *
     * ## Notes
     *
     * -  This API can be used to implicitly check if the current folder is a Git repository.
     *
     * @param count - number of commits to retrieve
     * @returns promise which resolves upon retrieving the repository commit log
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async allHistory(count = 25) {
        const path = await this._getPathRepository();
        return await this._taskHandler.execute('git:fetch:history', async () => {
            return await requestAPI(URLExt.join(path, 'all_history'), 'POST', {
                history_count: count
            });
        });
    }
    /**
     * Checkout a branch.
     *
     * ## Notes
     *
     * -   If a branch name is provided, checkout the provided branch (with or without creating it)
     * -   If a filename is provided, checkout the file, discarding all changes.
     * -   If nothing is provided, checkout all files, discarding all changes.
     *
     * TODO: Refactor into separate endpoints for each kind of checkout request
     *
     * @param options - checkout options
     * @returns promise which resolves upon performing a checkout
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async checkout(options) {
        const path = await this._getPathRepository();
        const body = {
            checkout_branch: false,
            new_check: false,
            branchname: '',
            startpoint: '',
            checkout_all: true,
            filename: ''
        };
        if (options !== undefined) {
            if (options.branchname) {
                body.branchname = options.branchname;
                body.checkout_branch = true;
                body.new_check = options.newBranch === true;
                if (options.newBranch) {
                    body.startpoint = options.startpoint || this._currentBranch.name;
                }
            }
            else if (options.filename) {
                body.filename = options.filename;
                body.checkout_all = false;
            }
        }
        const data = await this._taskHandler.execute('git:checkout', async () => {
            var _a;
            let changes;
            if (!body.new_check) {
                if (body.checkout_branch && !body.new_check) {
                    changes = await this._changedFiles(this._currentBranch.name, body.branchname);
                }
                else if (body.filename) {
                    changes = { files: [body.filename] };
                }
                else {
                    changes = await this._changedFiles('WORKING', 'HEAD');
                }
            }
            const d = await requestAPI(URLExt.join(path, 'checkout'), 'POST', body);
            (_a = changes === null || changes === void 0 ? void 0 : changes.files) === null || _a === void 0 ? void 0 : _a.forEach(file => this._revertFile(file));
            return d;
        });
        if (body.checkout_branch) {
            await this.refreshBranch();
        }
        else {
            await this.refreshStatus();
        }
        return data;
    }
    /**
     * Merge a branch into the current branch
     *
     * @param branch The branch to merge into the current branch
     */
    async merge(branch) {
        const path = await this._getPathRepository();
        return this._taskHandler.execute('git:merge', () => {
            return requestAPI(URLExt.join(path, 'merge'), 'POST', {
                branch
            });
        });
    }
    /**
     * Clone a repository.
     *
     * @param path - local path into which the repository will be cloned
     * @param url - Git repository URL
     * @param auth - remote repository authentication information
     * @returns promise which resolves upon cloning a repository
     *
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async clone(path, url, auth) {
        return await this._taskHandler.execute('git:clone', async () => {
            return await requestAPI(URLExt.join(path, 'clone'), 'POST', {
                clone_url: url,
                auth: auth
            });
        });
    }
    /**
     * Commit all staged file changes. If message is None, then the commit is amended
     *
     * @param message - commit message
     * @param amend - whether this is an amend commit
     * @returns promise which resolves upon committing file changes
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async commit(message, amend = false) {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:commit:create', async () => {
            await requestAPI(URLExt.join(path, 'commit'), 'POST', {
                commit_msg: message,
                amend: amend
            });
        });
        await this.refresh();
    }
    /**
     * Get (or set) Git configuration options.
     *
     * @param options - configuration options to set
     * @returns promise which resolves upon either getting or setting configuration options
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async config(options) {
        const path = await this._getPathRepository();
        return await this._taskHandler.execute('git:config:' + (options ? 'set' : 'get'), async () => {
            if (options) {
                await requestAPI(URLExt.join(path, 'config'), 'POST', {
                    options
                });
            }
            else {
                return await requestAPI(URLExt.join(path, 'config'), 'POST');
            }
        });
    }
    /**
     * Delete a branch
     *
     * @param branchName Branch name
     * @returns promise which resolves when the branch has been deleted.
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async deleteBranch(branchName) {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:branch:delete', async () => {
            return await requestAPI(URLExt.join(path, 'branch', 'delete'), 'POST', {
                branch: branchName
            });
        });
    }
    /**
     * Fetch commit information.
     *
     * @param hash - commit hash
     * @returns promise which resolves upon retrieving commit information
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async detailedLog(hash) {
        const path = await this._getPathRepository();
        const data = await this._taskHandler.execute('git:fetch:commit_log', async () => {
            return await requestAPI(URLExt.join(path, 'detailed_log'), 'POST', {
                selected_hash: hash
            });
        });
        data.modified_files = data.modified_files.map(f => {
            f.type = this._resolveFileType(f.modified_file_path);
            return f;
        });
        return data;
    }
    /**
     * Dispose of model resources.
     */
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this._isDisposed = true;
        this._fetchPoll.dispose();
        this._statusPoll.dispose();
        this._taskHandler.dispose();
        this._settings.changed.disconnect(this._onSettingsChange, this);
        Signal.clearData(this);
    }
    /**
     * Ensure a .gitignore file exists
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async ensureGitignore() {
        const path = await this._getPathRepository();
        await requestAPI(URLExt.join(path, 'ignore'), 'POST', {});
        this._openGitignore();
        await this.refreshStatus();
    }
    /**
     * Return the path of a file relative to the Jupyter server root.
     *
     * ## Notes
     *
     * -   If no path is provided, returns the Git repository top folder relative path.
     * -   If no Git repository selected, returns `null`
     *
     * @param path - file path relative to the top folder of the Git repository
     * @returns relative path
     */
    getRelativeFilePath(path) {
        if (this.pathRepository === null) {
            return null;
        }
        return PathExt.join(this.pathRepository, path !== null && path !== void 0 ? path : '');
    }
    /**
     * Add an entry in .gitignore file
     *
     * @param filePath File to ignore
     * @param useExtension Whether to ignore the file or its extension
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async ignore(filePath, useExtension) {
        const path = await this._getPathRepository();
        await requestAPI(URLExt.join(path, 'ignore'), 'POST', {
            file_path: filePath,
            use_extension: useExtension
        });
        this._openGitignore();
        await this.refreshStatus();
    }
    /**
     * Initialize a new Git repository at a specified path.
     *
     * @param path - path at which initialize a Git repository
     * @returns promise which resolves upon initializing a Git repository
     *
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async init(path) {
        await this._taskHandler.execute('git:init', async () => {
            await requestAPI(URLExt.join(path, 'init'), 'POST');
        });
    }
    /**
     * Retrieve commit logs.
     *
     * @param count - number of commits
     * @returns promise which resolves upon retrieving commit logs
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async log(count = 25) {
        const path = await this._getPathRepository();
        return await this._taskHandler.execute('git:fetch:log', async () => {
            var _a;
            return await requestAPI(URLExt.join(path, 'log'), 'POST', {
                history_count: count,
                follow_path: (_a = this.selectedHistoryFile) === null || _a === void 0 ? void 0 : _a.to
            });
        });
    }
    /**
     * Fetch changes from a remote repository.
     *
     * @param auth - remote authentication information
     * @returns promise which resolves upon fetching changes
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async pull(auth) {
        const path = await this._getPathRepository();
        const data = this._taskHandler.execute('git:pull', async () => {
            var _a;
            return await requestAPI(URLExt.join(path, 'pull'), 'POST', {
                auth: auth,
                cancel_on_conflict: ((_a = this._settings) === null || _a === void 0 ? void 0 : _a.composite['cancelPullMergeConflict']) || false
            });
        });
        this.refreshBranch(); // Will emit headChanged if required
        return data;
    }
    /**
     * Push local changes to a remote repository.
     *
     * @param auth - remote authentication information
     * @param force - whether or not to force the push
     * @returns promise which resolves upon pushing changes
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async push(auth, force = false) {
        const path = await this._getPathRepository();
        const data = this._taskHandler.execute('git:push', async () => {
            return await requestAPI(URLExt.join(path, 'push'), 'POST', {
                auth: auth,
                force: force
            });
        });
        this.refreshBranch();
        return data;
    }
    /**
     * Refresh the repository.
     *
     * @returns promise which resolves upon refreshing the repository
     */
    async refresh() {
        await this._statusPoll.refresh();
        await this._statusPoll.tick;
    }
    /**
     * Refresh the list of repository branches.
     *
     * Emit headChanged if the branch or its top commit changes
     *
     * @returns promise which resolves upon refreshing repository branches
     */
    async refreshBranch() {
        try {
            const data = await this._taskHandler.execute('git:refresh:branches', async () => {
                return await this._branch();
            });
            let headChanged = false;
            if (!this._currentBranch || !data) {
                headChanged = this._currentBranch !== data.current_branch; // Object comparison is not working
            }
            else {
                headChanged =
                    this._currentBranch.name !== data.current_branch.name ||
                        this._currentBranch.top_commit !== data.current_branch.top_commit;
            }
            this._branches = data.branches;
            this._currentBranch = data.current_branch;
            if (this._currentBranch) {
                // Set up the marker obj for the current (valid) repo/branch combination
                this._setMarker(this.pathRepository, this._currentBranch.name);
            }
            if (headChanged) {
                this._headChanged.emit();
            }
            // Start fetch remotes if the repository has remote branches
            const hasRemote = this._branches.some(branch => branch.is_remote_branch);
            if (hasRemote) {
                this._fetchPoll.start();
            }
            else {
                this._fetchPoll.stop();
            }
        }
        catch (error) {
            const headChanged = this._currentBranch !== null;
            this._branches = [];
            this._currentBranch = null;
            this._fetchPoll.stop();
            if (headChanged) {
                this._headChanged.emit();
            }
            if (!(error instanceof Git.NotInRepository)) {
                throw error;
            }
        }
    }
    /**
     * Refresh the repository status.
     *
     * Emit statusChanged if required.
     *
     * @returns promise which resolves upon refreshing the repository status
     */
    async refreshStatus() {
        var _a;
        let path;
        try {
            path = await this._getPathRepository();
        }
        catch (error) {
            this._clearStatus();
            if (!(error instanceof Git.NotInRepository)) {
                throw error;
            }
            return;
        }
        try {
            const data = await this._taskHandler.execute('git:refresh:status', async () => {
                return await requestAPI(URLExt.join(path, 'status'), 'POST');
            });
            const files = (_a = data.files) === null || _a === void 0 ? void 0 : _a.map(file => {
                return Object.assign(Object.assign({}, file), { status: decodeStage(file.x, file.y), type: this._resolveFileType(file.to) });
            });
            this._setStatus({
                branch: data.branch || null,
                remote: data.remote || null,
                ahead: data.ahead || 0,
                behind: data.behind || 0,
                files
            });
        }
        catch (err) {
            // TODO we should notify the user
            this._clearStatus();
            console.error(err);
            return;
        }
    }
    /**
     * Collects files that have changed on the remote branch.
     *
     */
    async remoteChangedFiles() {
        // if a file is changed on remote add it to list of files with appropriate status.
        this._remoteChangedFiles = [];
        try {
            let remoteChangedFiles = null;
            if (this.status.remote && this.status.behind > 0) {
                remoteChangedFiles = (await this._changedFiles('WORKING', this.status.remote)).files;
                remoteChangedFiles === null || remoteChangedFiles === void 0 ? void 0 : remoteChangedFiles.forEach(element => {
                    this._remoteChangedFiles.push({
                        status: 'remote-changed',
                        type: this._resolveFileType(element),
                        x: '?',
                        y: 'B',
                        to: element,
                        from: '?',
                        is_binary: false
                    });
                });
                return this._remoteChangedFiles;
            }
        }
        catch (err) {
            console.error(err);
            return this._remoteChangedFiles;
        }
    }
    /**
     * Determines if opened files are behind the remote and emits a signal if one
     * or more are behind and the user hasn't been notified of them yet.
     *
     */
    async checkRemoteChangeNotified() {
        if (this.status.remote && this.status.behind > 0) {
            const notNotified = [];
            const notified = [];
            for (const val of this._remoteChangedFiles) {
                const docWidget = this._docmanager.findWidget(this.getRelativeFilePath(val.to));
                const notifiedIndex = this._changeUpstreamNotified.findIndex(notified => notified.from === val.from &&
                    notified.to === val.to &&
                    notified.x === val.x &&
                    notified.y === val.y);
                if (docWidget !== undefined) {
                    if (docWidget.isAttached) {
                        // notify if the user hasn't been notified yet
                        if (notifiedIndex === -1) {
                            this._changeUpstreamNotified.push(val);
                            notNotified.push(val);
                        }
                        else {
                            notified.push(val);
                        }
                    }
                }
                else {
                    // remove from notified array if document is closed
                    if (notifiedIndex > -1) {
                        this._changeUpstreamNotified.splice(notifiedIndex, 1);
                    }
                }
            }
            if (this._settings.composite['openFilesBehindWarning']) {
                if (notNotified.length > 0) {
                    this._notifyRemoteChanges.emit({ notNotified, notified });
                }
            }
        }
        else {
            this._changeUpstreamNotified = [];
        }
    }
    /**
     * Move files from the "staged" to the "unstaged" area.
     *
     * ## Notes
     *
     * -  If no filename is provided, moves all files from the "staged" to the "unstaged" area.
     *
     * @param filename - file path to be reset
     * @returns promise which resolves upon moving files
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async reset(filename) {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:reset:changes', async () => {
            const reset_all = filename === undefined;
            let files;
            if (reset_all) {
                files = (await this._changedFiles('INDEX', 'HEAD')).files;
            }
            else {
                files = [filename];
            }
            await requestAPI(URLExt.join(path, 'reset'), 'POST', {
                reset_all: filename === undefined,
                filename: filename === undefined ? null : filename
            });
            files.forEach(file => {
                this._revertFile(file);
            });
        });
        await this.refreshStatus();
    }
    /**
     * Reset the repository to a specified commit.
     *
     * ## Notes
     *
     * -   If a commit hash is not provided, resets the repository to `HEAD`.
     *
     * @param hash - commit identifier (hash)
     * @returns promises which resolves upon resetting the repository
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async resetToCommit(hash = '') {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:reset:hard', async () => {
            const files = (await this._changedFiles(null, null, hash)).files;
            await requestAPI(URLExt.join(path, 'reset_to_commit'), 'POST', {
                commit_id: hash
            });
            files === null || files === void 0 ? void 0 : files.forEach(file => {
                this._revertFile(file);
            });
        });
        await this.refreshBranch();
    }
    /**
     * Retrieve the prefix path of a directory `path` with respect to the root repository directory.
     *
     * @param path - directory path
     * @returns promise which resolves upon retrieving the prefix path
     *
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async showPrefix(path) {
        var _a;
        try {
            const data = await this._taskHandler.execute('git:fetch:prefix_path', async () => {
                return await requestAPI(URLExt.join(path, 'show_prefix'), 'POST');
            });
            return (_a = data.path) !== null && _a !== void 0 ? _a : null;
        }
        catch (error) {
            if (error instanceof Git.GitResponseError &&
                error.response.status === 500 &&
                error.json.code === 128) {
                return null;
            }
            throw error;
        }
    }
    /**
     * Retrieve the top level repository path.
     *
     * @param path - current path
     * @returns promise which resolves upon retrieving the top level repository path
     *
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async showTopLevel(path) {
        var _a;
        try {
            const data = await this._taskHandler.execute('git:fetch:top_level_path', async () => {
                return await requestAPI(URLExt.join(path, 'show_top_level'), 'POST');
            });
            return (_a = data.path) !== null && _a !== void 0 ? _a : null;
        }
        catch (error) {
            if (error instanceof Git.GitResponseError &&
                error.response.status === 500 &&
                error.json.code === 128) {
                return null;
            }
            throw error;
        }
    }
    /**
     * Retrieve the list of tags in the repository.
     *
     * @returns promise which resolves upon retrieving the tag list
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async tags() {
        const path = await this._getPathRepository();
        return await this._taskHandler.execute('git:tag:list', async () => {
            return await requestAPI(URLExt.join(path, 'tags'), 'POST');
        });
    }
    /**
     * Checkout the specified tag version
     *
     * @param tag - selected tag version
     * @returns promise which resolves upon checking out the tag version of the repository
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async checkoutTag(tag) {
        const path = await this._getPathRepository();
        return await this._taskHandler.execute('git:tag:checkout', async () => {
            return await requestAPI(URLExt.join(path, 'tag_checkout'), 'POST', {
                tag_id: tag
            });
        });
    }
    /**
     * Add a file to the current marker object.
     *
     * @param fname - filename
     * @param mark - mark to set
     */
    addMark(fname, mark) {
        this._currentMarker.add(fname, mark);
    }
    /**
     * Return the current mark associated with a specified filename.
     *
     * @param fname - filename
     * @returns mark
     */
    getMark(fname) {
        return this._currentMarker.get(fname);
    }
    /**
     * Toggle the mark for a file in the current marker object
     *
     * @param fname - filename
     */
    toggleMark(fname) {
        this._currentMarker.toggle(fname);
    }
    /**
     * Register a new diff provider for specified file types
     *
     * @param fileExtensions File type list
     * @param callback Callback to use for the provided file types
     */
    registerDiffProvider(name, fileExtensions, callback) {
        fileExtensions.forEach(fileExtension => {
            DIFF_PROVIDERS[fileExtension.toLocaleLowerCase()] = { name, callback };
        });
    }
    /**
     * Revert changes made after a specified commit.
     *
     * @param message - commit message
     * @param hash - commit identifier (hash)
     * @returns promise which resolves upon reverting changes
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async revertCommit(message, hash) {
        const path = await this._getPathRepository();
        await this._taskHandler.execute('git:commit:revert', async () => {
            const files = (await this._changedFiles(null, null, hash + '^!')).files;
            await requestAPI(URLExt.join(path, 'delete_commit'), 'POST', {
                commit_id: hash
            });
            files === null || files === void 0 ? void 0 : files.forEach(file => {
                this._revertFile(file);
            });
        });
        await this.commit(message);
    }
    /**
     * Make request for a list of all git branches in the repository
     * Retrieve a list of repository branches.
     *
     * @returns promise which resolves upon fetching repository branches
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async _branch() {
        const path = await this._getPathRepository();
        return await this._taskHandler.execute('git:fetch:branches', async () => {
            return await requestAPI(URLExt.join(path, 'branch'), 'POST');
        });
    }
    /**
     * Get list of files changed between two commits or two branches.
     *
     * Notes:
     *   It assumes the Git path repository as already been checked.
     *
     * @param base id of base commit or base branch for comparison
     * @param remote id of remote commit or remote branch for comparison
     * @param singleCommit id of a single commit
     *
     * @returns the names of the changed files
     *
     * @throws {Git.GitResponseError} If the server response is not ok
     * @throws {ServerConnection.NetworkError} If the request cannot be made
     */
    async _changedFiles(base, remote, singleCommit) {
        return await requestAPI(URLExt.join(this.pathRepository, 'changed_files'), 'POST', {
            base: base,
            remote: remote,
            single_commit: singleCommit
        });
    }
    /**
     * Clear repository status
     */
    _clearStatus() {
        this._status = {
            branch: null,
            remote: null,
            ahead: 0,
            behind: 0,
            files: []
        };
    }
    /**
     * Get the current Git repository path
     *
     * @throws {Git.NotInRepository} If the current path is not a Git repository
     */
    async _getPathRepository() {
        await this.ready;
        const path = this.pathRepository;
        if (path === null) {
            throw new Git.NotInRepository();
        }
        return path;
    }
    /**
     * Resolve path to filetype
     */
    _resolveFileType(path) {
        // test if directory
        if (path.endsWith('/')) {
            return DocumentRegistry.getDefaultDirectoryFileType();
        }
        return (this._docRegistry.getFileTypesForPath(path)[0] ||
            DocumentRegistry.getDefaultTextFileType());
    }
    /**
     * Set the repository status.
     *
     * @param v - repository status
     */
    _setStatus(v) {
        let areEqual = this._status.ahead === v.ahead &&
            this._status.behind === v.behind &&
            this._status.branch === v.branch &&
            this._status.files.length === v.files.length;
        if (areEqual) {
            for (const file of v.files) {
                if (this._status.files.findIndex(oldFile => oldFile.from === file.from &&
                    oldFile.to === file.to &&
                    oldFile.x === file.x &&
                    oldFile.y === file.y)) {
                    areEqual = false;
                    break;
                }
            }
        }
        if (!areEqual) {
            this._status = v;
            this._statusChanged.emit(this._status);
        }
    }
    /**
     * Callback invoked upon a change to plugin settings.
     *
     * @private
     * @param settings - plugin settings
     */
    _onSettingsChange(settings) {
        this._fetchPoll.frequency = Object.assign(Object.assign({}, this._fetchPoll.frequency), { interval: settings.composite.refreshInterval });
        this._statusPoll.frequency = Object.assign(Object.assign({}, this._statusPoll.frequency), { interval: settings.composite.refreshInterval });
    }
    /**
     * open new editor or show an existing editor of the
     * .gitignore file. If the editor does not have unsaved changes
     * then ensure the editor's content matches the file on disk
     */
    _openGitignore() {
        if (this._docmanager) {
            const widget = this._docmanager.openOrReveal(this.getRelativeFilePath('.gitignore'));
            if (widget && !widget.context.model.dirty) {
                widget.context.revert();
            }
        }
    }
    /**
     * if file is open in JupyterLab find the widget and ensure the JupyterLab
     * version matches the version on disk. Do nothing if the file has unsaved changes
     *
     * @param path path to the file to be reverted
     */
    _revertFile(path) {
        const widget = this._docmanager.findWidget(this.getRelativeFilePath(path));
        if (widget && !widget.context.model.dirty) {
            widget.context.revert();
        }
    }
    /**
     * Set the marker object for a repository path and branch.
     */
    _setMarker(path, branch) {
        this.__currentMarker = this._markerCache.get(path, branch);
    }
}
export class BranchMarker {
    constructor(_refresh) {
        this._refresh = _refresh;
        this._marks = {};
    }
    add(fname, mark = true) {
        if (!(fname in this._marks)) {
            this.set(fname, mark);
        }
    }
    get(fname) {
        return this._marks[fname];
    }
    set(fname, mark) {
        this._marks[fname] = mark;
        this._refresh();
    }
    toggle(fname) {
        this.set(fname, !this._marks[fname]);
    }
}
export class Markers {
    constructor(_refresh) {
        this._refresh = _refresh;
        this._branchMarkers = {};
    }
    get(path, branch) {
        const key = Markers.markerKey(path, branch);
        if (key in this._branchMarkers) {
            return this._branchMarkers[key];
        }
        const marker = new BranchMarker(this._refresh);
        this._branchMarkers[key] = marker;
        return marker;
    }
    static markerKey(path, branch) {
        return [path, branch].join(':');
    }
}
//# sourceMappingURL=model.js.map