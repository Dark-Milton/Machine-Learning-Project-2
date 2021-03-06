import Input from '@material-ui/core/Input';
import * as React from 'react';
import { activeStyle, commitDescriptionClass, commitRoot, commitSummaryClass, disabledStyle } from '../style/CommitBox';
/**
 * Commit message component
 */
export function CommitMessage(props) {
    var _a, _b, _c, _d;
    const summaryPlaceholder = (_a = props.summaryPlaceholder) !== null && _a !== void 0 ? _a : props.trans.__('Summary');
    /**
     * Callback invoked upon updating a commit message description.
     *
     * @param event - event object
     */
    function onDescriptionChange(event) {
        props.setDescription(event.target.value);
    }
    /**
     * Callback invoked upon updating a commit message summary.
     *
     * @param event - event object
     */
    function onSummaryChange(event) {
        props.setSummary(event.target.value);
    }
    /**
     * Callback invoked upon a `'keypress'` event when entering a commit message summary.
     *
     * ## Notes
     *
     * -   Prevents triggering a `'submit'` action when hitting the `ENTER` key while entering a commit message summary.
     *
     * @param event - event object
     */
    function onSummaryKeyPress(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    }
    return (React.createElement(React.Fragment, null,
        React.createElement(Input, { className: commitSummaryClass, classes: {
                root: commitRoot,
                focused: activeStyle,
                disabled: disabledStyle
            }, type: "text", placeholder: summaryPlaceholder, title: props.disabled
                ? props.trans.__('Amending the commit will re-use the previous commit summary')
                : props.trans.__('Enter a commit message summary (a single line, preferably less than 50 characters)'), value: props.summary, onChange: onSummaryChange, onKeyPress: onSummaryKeyPress, disabled: (_b = props.disabled) !== null && _b !== void 0 ? _b : false, disableUnderline: true, fullWidth: true }),
        React.createElement(Input, { className: commitDescriptionClass, classes: {
                root: commitRoot,
                focused: activeStyle,
                disabled: disabledStyle
            }, multiline: true, minRows: 5, maxRows: 10, placeholder: (_c = props.descriptionPlaceholder) !== null && _c !== void 0 ? _c : props.trans.__('Description (optional)'), title: props.disabled
                ? props.trans.__('Amending the commit will re-use the previous commit summary')
                : props.trans.__('Enter a commit message description'), value: props.description, onChange: onDescriptionChange, disabled: (_d = props.disabled) !== null && _d !== void 0 ? _d : false, disableUnderline: true, fullWidth: true })));
}
//# sourceMappingURL=CommitMessage.js.map