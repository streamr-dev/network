"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCertifierServiceClient = void 0;
const AutoCertifier_1 = require("./AutoCertifier");
const runtime_rpc_1 = require("@protobuf-ts/runtime-rpc");
/**
 * @generated from protobuf service autocertifier.AutoCertifierService
 */
class AutoCertifierServiceClient {
    constructor(_transport) {
        this._transport = _transport;
        this.typeName = AutoCertifier_1.AutoCertifierService.typeName;
        this.methods = AutoCertifier_1.AutoCertifierService.methods;
        this.options = AutoCertifier_1.AutoCertifierService.options;
    }
    /**
     * @generated from protobuf rpc: getSessionId(autocertifier.SessionIdRequest) returns (autocertifier.SessionIdResponse);
     */
    getSessionId(input, options) {
        const method = this.methods[0], opt = this._transport.mergeOptions(options);
        return (0, runtime_rpc_1.stackIntercept)("unary", this._transport, method, opt, input);
    }
}
exports.AutoCertifierServiceClient = AutoCertifierServiceClient;
//# sourceMappingURL=AutoCertifier.client.js.map