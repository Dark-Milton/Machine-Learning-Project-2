import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import ListItem from '@material-ui/core/ListItem';
import ClearIcon from '@material-ui/icons/Clear';
import * as React from 'react';
import { VariableSizeList } from 'react-window';
import { classes } from 'typestyle';
import { branchIcon } from '../style/icons';
import { actionsWrapperClass, activeListItemClass, branchDialogClass, buttonClass, cancelButtonClass, closeButtonClass, contentWrapperClass, createButtonClass, errorMessageClass, filterClass, filterClearClass, filterInputClass, filterWrapperClass, listItemBoldTitleClass, listItemClass, listItemContentClass, listItemDescClass, listItemIconClass, listItemTitleClass, listWrapperClass, nameInputClass, titleClass, titleWrapperClass } from '../style/NewBranchDialog';
import { Level } from '../tokens';
const ITEM_HEIGHT = 27.5; // HTML element height for a single branch
const CURRENT_BRANCH_HEIGHT = 66.5; // HTML element height for the current branch with description
const HEIGHT = 200; // HTML element height for the branches list
/**
 * React component for rendering a dialog to create a new branch.
 */
export class NewBranchDialog extends React.Component {
    /**
     * Returns a React component for rendering a branch menu.
     *
     * @param props - component properties
     * @returns React component
     */
    constructor(props) {
        super(props);
        /**
         * Renders a branch menu item.
         *
         * @param props Row properties
         * @returns React element
         */
        this._renderItem = (props) => {
            const { data, index, style } = props;
            const branch = data[index];
            const isBase = branch.name === this.state.base;
            const isCurrent = branch.name === this.props.currentBranch;
            let isBold;
            let desc;
            if (isCurrent) {
                isBold = true;
                desc = this.props.trans.__('The current branch. Pick this if you want to build on work done in this branch.');
            }
            else if (['master', 'main'].includes(branch.name)) {
                isBold = true;
                desc = this.props.trans.__('The default branch. Pick this if you want to start fresh from the default branch.');
            }
            return (React.createElement(ListItem, { button: true, title: this.props.trans.__('Create a new branch based on: %1', branch.name), className: classes(listItemClass, isBase ? activeListItemClass : null), onClick: this._onBranchClickFactory(branch.name), style: style },
                React.createElement(branchIcon.react, { className: listItemIconClass, tag: "span" }),
                React.createElement("div", { className: listItemContentClass },
                    React.createElement("p", { className: classes(listItemTitleClass, isBold ? listItemBoldTitleClass : null) }, branch.name),
                    desc ? (React.createElement("p", { className: listItemDescClass }, this.props.trans.__(desc))) : null)));
        };
        /**
         * Callback invoked upon closing the dialog.
         *
         * @param event - event object
         */
        this._onClose = () => {
            this.props.onClose();
            this.setState({
                name: '',
                filter: '',
                error: ''
            });
        };
        /**
         * Callback invoked upon a change to the menu filter.
         *
         * @param event - event object
         */
        this._onFilterChange = (event) => {
            this._branchList.current.resetAfterIndex(0);
            this.setState({
                filter: event.target.value
            });
        };
        /**
         * Callback invoked to reset the menu filter.
         */
        this._resetFilter = () => {
            this._branchList.current.resetAfterIndex(0);
            this.setState({
                filter: ''
            });
        };
        /**
         * Callback invoked upon a change to the branch name input element.
         *
         * @param event - event object
         */
        this._onNameChange = (event) => {
            this.setState({
                name: event.target.value,
                error: ''
            });
        };
        /**
         * Callback invoked upon clicking a button to create a new branch.
         *
         * @param event - event object
         */
        this._onCreate = () => {
            // Create the branch:
            this._createBranch(this.state.name);
        };
        this._branchList = React.createRef();
        this.state = {
            name: '',
            base: props.currentBranch || '',
            filter: '',
            error: ''
        };
    }
    /**
     * Renders a dialog for creating a new branch.
     *
     * @returns React element
     */
    render() {
        return (React.createElement(Dialog, { classes: {
                paper: branchDialogClass
            }, open: this.props.open, onClose: this._onClose },
            React.createElement("div", { className: titleWrapperClass },
                React.createElement("p", { className: titleClass }, this.props.trans.__('Create a Branch')),
                React.createElement("button", { className: closeButtonClass },
                    React.createElement(ClearIcon, { titleAccess: this.props.trans.__('Close this dialog'), fontSize: "small", onClick: this._onClose }))),
            React.createElement("div", { className: contentWrapperClass },
                this.state.error ? (React.createElement("p", { className: errorMessageClass }, this.state.error)) : null,
                React.createElement("p", null, this.props.trans.__('Name')),
                React.createElement("input", { className: nameInputClass, type: "text", onChange: this._onNameChange, value: this.state.name, placeholder: "", title: this.props.trans.__('Enter a branch name') }),
                React.createElement("p", null, this.props.trans.__('Create branch based on???')),
                React.createElement("div", { className: filterWrapperClass },
                    React.createElement("div", { className: filterClass },
                        React.createElement("input", { className: filterInputClass, type: "text", onChange: this._onFilterChange, value: this.state.filter, placeholder: this.props.trans.__('Filter'), title: this.props.trans.__('Filter branch menu') }),
                        this.state.filter ? (React.createElement("button", { className: filterClearClass },
                            React.createElement(ClearIcon, { titleAccess: this.props.trans.__('Clear the current filter'), fontSize: "small", onClick: this._resetFilter }))) : null)),
                this._renderItems()),
            React.createElement(DialogActions, { className: actionsWrapperClass },
                React.createElement("input", { className: classes(buttonClass, cancelButtonClass), type: "button", title: this.props.trans.__('Close this dialog without creating a new branch'), value: this.props.trans.__('Cancel'), onClick: this._onClose }),
                React.createElement("input", { className: classes(buttonClass, createButtonClass), type: "button", title: this.props.trans.__('Create a new branch'), value: this.props.trans.__('Create Branch'), onClick: this._onCreate, disabled: this.state.name === '' || this.state.error !== '' }))));
    }
    /**
     * Renders branch menu items.
     *
     * @returns array of React elements
     */
    _renderItems() {
        const current = this.props.currentBranch;
        // Perform a "simple" filter... (TODO: consider implementing fuzzy filtering)
        const filter = this.state.filter;
        const branches = this.props.branches
            .filter(branch => !filter || branch.name.includes(filter))
            .slice()
            .sort(comparator);
        return (React.createElement(VariableSizeList, { className: listWrapperClass, height: HEIGHT, estimatedItemSize: ITEM_HEIGHT, itemCount: branches.length, itemData: branches, itemKey: (index, data) => data[index].name, itemSize: index => {
                const branch = branches[index];
                return [this.props.currentBranch, 'master', 'main'].includes(branch.name)
                    ? CURRENT_BRANCH_HEIGHT
                    : ITEM_HEIGHT;
            }, ref: this._branchList, style: { overflowX: 'hidden' }, width: 'auto' }, this._renderItem));
        /**
         * Comparator function for sorting branches.
         *
         * @private
         * @param a - first branch
         * @param b - second branch
         * @returns integer indicating sort order
         */
        function comparator(a, b) {
            if (a.name === current) {
                return -1;
            }
            else if (b.name === current) {
                return 1;
            }
            if (a.name === 'master') {
                return -1;
            }
            else if (b.name === 'master') {
                return 1;
            }
            if (a.name === 'main') {
                return -1;
            }
            else if (b.name === 'main') {
                return 1;
            }
            return 0;
        }
    }
    /**
     * Returns a callback which is invoked upon clicking a branch name.
     *
     * @param branch - branch name
     * @returns callback
     */
    _onBranchClickFactory(branch) {
        const self = this;
        return onClick;
        /**
         * Callback invoked upon clicking a branch name.
         *
         * @private
         * @param event - event object
         */
        function onClick() {
            self.setState({
                base: branch
            });
        }
    }
    /**
     * Creates a new branch.
     *
     * @param branch - branch name
     * @returns promise which resolves upon attempting to create a new branch
     */
    async _createBranch(branch) {
        const opts = {
            newBranch: true,
            branchname: branch
        };
        this.props.logger.log({
            level: Level.RUNNING,
            message: this.props.trans.__('Creating branch???')
        });
        try {
            await this.props.model.checkout(opts);
        }
        catch (err) {
            this.setState({
                error: err.message.replace(/^fatal:/, '')
            });
            this.props.logger.log({
                level: Level.ERROR,
                message: this.props.trans.__('Failed to create branch.')
            });
            return;
        }
        this.props.logger.log({
            level: Level.SUCCESS,
            message: this.props.trans.__('Branch created.')
        });
        // Close the branch dialog:
        this.props.onClose();
        // Reset the branch name and filter:
        this._branchList.current.resetAfterIndex(0);
        this.setState({
            name: '',
            filter: ''
        });
    }
}
//# sourceMappingURL=NewBranchDialog.js.map