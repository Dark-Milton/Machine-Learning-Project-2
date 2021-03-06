/// <reference types="react" />
import { ReactWidget } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStatusBar } from '@jupyterlab/statusbar';
import { TranslationBundle } from '@jupyterlab/translation';
import { IGitExtension } from '../tokens';
export declare class StatusWidget extends ReactWidget {
    /**
     * Returns a status bar widget.
     * @param trans - The language translator
     * @returns widget
     */
    constructor(trans: TranslationBundle);
    /**
     * Sets the current status.
     */
    set status(text: string);
    render(): JSX.Element;
    /**
     * Locks the status widget to prevent updates.
     *
     * ## Notes
     *
     * -   This is used to throttle updates in order to prevent "flashing" messages.
     */
    _animate(): Promise<void>;
    /**
     * Boolean indicating whether the status widget is accepting updates.
     */
    private _locked;
    /**
     * Status string.
     */
    private _status;
    private _trans;
}
export declare function addStatusBarWidget(statusBar: IStatusBar, model: IGitExtension, settings: ISettingRegistry.ISettings, trans: TranslationBundle): void;
