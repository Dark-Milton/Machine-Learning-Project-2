import { TranslationBundle } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import * as React from 'react';
/**
 * Interface describing component properties.
 */
export interface ICommitBoxProps {
    /**
     * Jupyter App commands registry
     */
    commands: CommandRegistry;
    /**
     * Boolean indicating whether files currently exist which have changes to commit.
     */
    hasFiles: boolean;
    /**
     * Commit button label
     */
    label: string;
    /**
     * The application language translator.
     */
    trans: TranslationBundle;
    /**
     * Commit message summary.
     */
    summary: string;
    /**
     * Commit message description.
     */
    description: string;
    /**
     * Whether commit is amending the previous one or not
     */
    amend: boolean;
    /**
     * Updates the commit message summary.
     *
     * @param summary - commit message summary
     */
    setSummary: (summary: string) => void;
    /**
     * Updates the commit message description.
     *
     * @param description - commit message description
     */
    setDescription: (description: string) => void;
    /**
     * Updates the amend checkbox state
     *
     * @param amend - amend toggle on/off
     */
    setAmend: (amend: boolean) => void;
    /**
     * Callback to invoke in order to commit changes.
     *
     * @returns a promise which commits changes
     */
    onCommit: () => Promise<void>;
}
/**
 * CommitBox state
 */
export interface ICommitBoxState {
    /**
     * Whether the commit variant menu is opened or not.
     */
    open: boolean;
}
/**
 * React component for entering a commit message.
 */
export declare class CommitBox extends React.Component<ICommitBoxProps, ICommitBoxState> {
    /**
     * Returns a React component for entering a commit message.
     *
     * @param props - component properties
     * @returns React component
     */
    constructor(props: ICommitBoxProps);
    componentDidMount(): void;
    componentWillUnmount(): void;
    /**
     * Renders the component.
     *
     * @returns React element
     */
    render(): React.ReactElement;
    /**
     * Whether a commit can be performed (files are staged and summary is not empty).
     */
    private _canCommit;
    /**
     * Get keystroke configured to act as a submit action.
     */
    private _getSubmitKeystroke;
    /**
     * Close the commit variant menu if needed.
     */
    private _handleClose;
    /**
     * Handle commit variant menu item click
     */
    private _handleMenuItemClick;
    /**
     * Toggle state of the commit variant menu visibility
     */
    private _handleToggle;
    /**
     * Callback invoked upon command execution activated when entering a commit message description.
     *
     * ## Notes
     *
     * -   Triggers the `'submit'` action on appropriate command (and if commit is possible)
     *
     */
    private _handleCommand;
    private _anchorRef;
    private _options;
}
