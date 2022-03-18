"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusValidator = void 0;
const ajv_1 = __importDefault(require("ajv"));
const schemas_1 = require("./schemas");
const LATEST_STATUS_VERSION = 'brubeck-1.0';
class StatusValidator {
    constructor() {
        const ajv = new ajv_1.default();
        this.versions = {
            'brubeck-1.0': ajv.compile(schemas_1.statusSchema),
        };
    }
    validate(status, version) {
        if (version && version in this.versions) {
            return this.versions[version](status);
        }
        // Check latest version first as backup (mostly for easier test maintainability)
        return this.versions[LATEST_STATUS_VERSION](status);
    }
}
exports.StatusValidator = StatusValidator;
//# sourceMappingURL=SchemaValidators.js.map