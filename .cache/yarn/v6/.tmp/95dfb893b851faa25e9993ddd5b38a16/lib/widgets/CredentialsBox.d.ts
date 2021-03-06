import { Dialog } from '@jupyterlab/apputils';
import { TranslationBundle } from '@jupyterlab/translation';
import { Widget } from '@lumino/widgets';
import { Git } from '../tokens';
/**
 * The UI for the credentials form
 */
export declare class GitCredentialsForm extends Widget implements Dialog.IBodyWidget<Git.IAuth> {
    constructor(trans: TranslationBundle, textContent?: string, warningContent?: string);
    private createBody;
    /**
     * Returns the input value.
     */
    getValue(): Git.IAuth;
    protected _trans: TranslationBundle;
    private _user;
    private _password;
}
