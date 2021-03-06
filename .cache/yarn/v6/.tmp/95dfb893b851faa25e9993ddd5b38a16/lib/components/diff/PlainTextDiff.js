import { Mode } from '@jupyterlab/codemirror';
import { nullTranslator } from '@jupyterlab/translation';
import { PromiseDelegate } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import { mergeView } from './mergeview';
/**
 * Diff callback to be registered for plain-text files.
 *
 * @param model Diff model
 * @param toolbar MainAreaWidget toolbar
 * @returns PlainText diff widget
 */
export const createPlainTextDiff = async (model, toolbar, translator) => {
    const widget = new PlainTextDiff(model, translator.load('jupyterlab_git'));
    await widget.ready;
    return widget;
};
/**
 * Plain Text Diff widget
 */
export class PlainTextDiff extends Widget {
    constructor(model, translator) {
        var _a, _b, _c;
        super({
            node: PlainTextDiff.createNode(model.reference.label, (_a = model.base) === null || _a === void 0 ? void 0 : _a.label, model.challenger.label)
        });
        this._reference = null;
        this._challenger = null;
        this._base = null;
        const getReady = new PromiseDelegate();
        this._isReady = getReady.promise;
        this._container = this.node.lastElementChild;
        this._model = model;
        this._trans = translator !== null && translator !== void 0 ? translator : nullTranslator.load('jupyterlab_git');
        // Load file content early
        Promise.all([
            this._model.reference.content(),
            this._model.challenger.content(),
            (_c = (_b = this._model.base) === null || _b === void 0 ? void 0 : _b.content()) !== null && _c !== void 0 ? _c : Promise.resolve(null)
        ])
            .then(([reference, challenger, base]) => {
            this._reference = reference;
            this._challenger = challenger;
            this._base = base;
            getReady.resolve();
        })
            .catch(reason => {
            this.showError(reason);
            getReady.resolve();
        });
    }
    /**
     * Helper to determine if three-way diff should be shown.
     */
    get _hasConflict() {
        return this._model.hasConflict;
    }
    /**
     * Checks if the conflicted file has been resolved.
     */
    get isFileResolved() {
        return true;
    }
    /**
     * Promise which fulfills when the widget is ready.
     */
    get ready() {
        return this._isReady;
    }
    /**
     * Gets the file model of a resolved merge conflict,
     * and rejects if unable to retrieve.
     */
    getResolvedFile() {
        var _a, _b;
        const value = (_b = (_a = this._mergeView) === null || _a === void 0 ? void 0 : _a.editor().getValue()) !== null && _b !== void 0 ? _b : null;
        if (value !== null) {
            return Promise.resolve({
                type: 'file',
                format: 'text',
                content: value
            });
        }
        else {
            return Promise.reject(this._trans.__('Failed to get a valid file value.'));
        }
    }
    /**
     * Callback to create the diff widget once the widget
     * is attached so CodeMirror get proper size.
     */
    onAfterAttach() {
        this.ready
            .then(() => {
            if (this._challenger !== null && this._reference !== null) {
                this.createDiffView(this._challenger, this._reference, this._hasConflict ? this._base : null);
            }
        })
            .catch(reason => {
            this.showError(reason);
        });
    }
    /**
     * Undo onAfterAttach
     */
    onBeforeDetach() {
        this._container.innerHTML = '';
    }
    /**
     * Refresh diff
     *
     * Note: Update the content and recompute the diff
     */
    async refresh() {
        var _a, _b;
        await this.ready;
        try {
            // Clear all
            this._container.innerHTML = '';
            this._mergeView = null;
            // ENH request content only if it changed
            if (this._reference !== null) {
                this._reference = await this._model.reference.content();
            }
            if (this._challenger !== null) {
                this._challenger = await this._model.challenger.content();
            }
            if (this._base !== null) {
                this._base = (_b = (await ((_a = this._model.base) === null || _a === void 0 ? void 0 : _a.content()))) !== null && _b !== void 0 ? _b : null;
            }
            this.createDiffView(this._challenger, this._reference, this._hasConflict ? this._base : null);
            this._challenger = null;
            this._reference = null;
            this._base = null;
        }
        catch (reason) {
            this.showError(reason);
        }
    }
    /**
     * Create wrapper node
     */
    static createNode(...labels) {
        const bannerClass = labels[1] !== undefined ? 'jp-git-merge-banner' : 'jp-git-diff-banner';
        const head = document.createElement('div');
        head.className = 'jp-git-diff-root';
        head.innerHTML = `
    <div class="${bannerClass}">
      ${labels
            .filter(label => !!label)
            .map(label => `<span>${label}</span>`)
            .join('<span class="jp-spacer"></span>')}
    </div>
    <div class="jp-git-PlainText-diff"></div>`;
        return head;
    }
    /**
     * Create the Plain Text Diff view
     *
     * Note: baseContent will only be passed when displaying
     *       a three-way merge conflict.
     */
    async createDiffView(challengerContent, referenceContent, baseContent) {
        if (!this._mergeView) {
            const mode = Mode.findByFileName(this._model.filename) ||
                Mode.findBest(this._model.filename);
            let options = Object.assign({ value: challengerContent, orig: referenceContent, mode: mode.mime }, this.getDefaultOptions());
            // Show three-way diff on merge conflict
            // Note: Empty base content ("") is an edge case.
            if (baseContent !== null && baseContent !== undefined) {
                options = Object.assign(Object.assign({}, options), { origLeft: referenceContent, value: baseContent, origRight: challengerContent, readOnly: false, revertButtons: true });
            }
            this._mergeView = mergeView(this._container, options);
        }
        return Promise.resolve();
    }
    /**
     * Display an error instead of the file diff
     *
     * @param error Error object
     */
    showError(error) {
        var _a;
        console.error(this._trans.__('Failed to load file diff.'), error, (_a = error) === null || _a === void 0 ? void 0 : _a.traceback);
        const msg = (error.message || error).replace('\n', '<br />');
        this.node.innerHTML = `<p class="jp-git-diff-error">
      <span>${this._trans.__('Error Loading File Diff:')}</span>
      <span class="jp-git-diff-error-message">${msg}</span>
    </p>`;
    }
    getDefaultOptions() {
        // FIXME add options from settings and connect settings to update options
        return {
            lineNumbers: true,
            theme: 'jupyter',
            connect: 'align',
            collapseIdentical: true,
            readOnly: true,
            revertButtons: false
        };
    }
}
//# sourceMappingURL=PlainTextDiff.js.map