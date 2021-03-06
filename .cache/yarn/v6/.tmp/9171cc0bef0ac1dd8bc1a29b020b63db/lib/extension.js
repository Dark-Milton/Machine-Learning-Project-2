"use strict";
// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
// Entry point for the notebook bundle containing custom model definitions.
//
// Setup notebook base URL
//
// Some static assets may be required by the custom widget javascript. The base
// url for the notebook is not known at build time and is therefore computed
// dynamically.
// Type 'unknown' causes Jupyter Lab build to fail.
// tslint:disable:no-any
if (document.querySelector('body') != null &&
    document.querySelector('body').getAttribute('data-base-url')) {
    window.__webpack_public_path__ =
        document.querySelector('body').getAttribute('data-base-url') +
            'nbextensions/xai_tabular_widget';
}
else {
    window.__webpack_public_path__ =
        'nbextensions/xai_tabular_widget';
}
// tslint:enable:no-any
__export(require("./index"));
//# sourceMappingURL=extension.js.map