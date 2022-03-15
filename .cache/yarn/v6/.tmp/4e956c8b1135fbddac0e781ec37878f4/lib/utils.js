"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlRStrip = void 0;
function urlRStrip(target) {
    if (target.slice(-1) === '/') {
        return target.slice(0, -1);
    }
    return target;
}
exports.urlRStrip = urlRStrip;
//# sourceMappingURL=utils.js.map