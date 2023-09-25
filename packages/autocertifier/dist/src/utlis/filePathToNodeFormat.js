"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filePathToNodeFormat = void 0;
const os_1 = __importDefault(require("os"));
function filePathToNodeFormat(filePath) {
    if (filePath.startsWith('~/')) {
        return filePath.replace('~', os_1.default.homedir());
    }
    else {
        return filePath;
    }
}
exports.filePathToNodeFormat = filePathToNodeFormat;
//# sourceMappingURL=filePathToNodeFormat.js.map