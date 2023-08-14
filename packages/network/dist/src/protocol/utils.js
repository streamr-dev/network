"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decode = void 0;
function decode(serializedMessage, deserializeFn) {
    try {
        return deserializeFn(serializedMessage);
    }
    catch {
        return null;
    }
}
exports.decode = decode;
//# sourceMappingURL=utils.js.map