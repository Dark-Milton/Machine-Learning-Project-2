"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Progress = void 0;
const React = __importStar(require("react"));
const core_1 = require("@material-ui/core");
const styles_1 = require("../../styles");
// tslint:disable:enforce-name-casing
const StyledProgress = core_1.withStyles({
    root: {
        color: styles_1.COLORS.link,
    },
})(core_1.CircularProgress);
/** Styled Progress indicator */
function Progress() {
    return React.createElement(StyledProgress, { size: "18px" });
}
exports.Progress = Progress;
