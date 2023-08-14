"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NegotiatedProtocolVersions = void 0;
const protocol_1 = require("@streamr/protocol");
const defaultControlLayerVersions = protocol_1.ControlMessage.getSupportedVersions();
const defaultMessageLayerVersions = protocol_1.StreamMessage.getSupportedVersions();
class NegotiatedProtocolVersions {
    constructor(peerInfo) {
        this.negotiatedProtocolVersions = Object.create(null);
        this.peerInfo = peerInfo;
        this.defaultProtocolVersions = {
            controlLayerVersion: Math.max(0, ...defaultControlLayerVersions),
            messageLayerVersion: Math.max(0, ...defaultMessageLayerVersions)
        };
    }
    negotiateProtocolVersion(peerId, controlLayerVersions, messageLayerVersions) {
        const [controlLayerVersion, messageLayerVersion] = this.validateProtocolVersions(controlLayerVersions, messageLayerVersions);
        this.negotiatedProtocolVersions[peerId] = {
            controlLayerVersion,
            messageLayerVersion
        };
    }
    removeNegotiatedProtocolVersion(peerId) {
        delete this.negotiatedProtocolVersions[peerId];
    }
    getNegotiatedProtocolVersions(peerId) {
        return this.negotiatedProtocolVersions[peerId];
    }
    getDefaultProtocolVersions() {
        return this.defaultProtocolVersions;
    }
    validateProtocolVersions(controlLayerVersions, messageLayerVersions) {
        if (!controlLayerVersions || !messageLayerVersions || controlLayerVersions.length === 0 || messageLayerVersions.length === 0) {
            throw new Error('Missing version negotiation! Must give controlLayerVersions and messageLayerVersions as query parameters!');
        }
        const controlLayerVersion = Math.max(...this.peerInfo.controlLayerVersions.filter((version) => controlLayerVersions.includes(version)));
        const messageLayerVersion = Math.max(...this.peerInfo.messageLayerVersions.filter((version) => messageLayerVersions.includes(version)));
        // Validate that the requested versions are supported
        if (controlLayerVersion < 0) {
            throw new Error(`Supported ControlLayer versions: ${JSON.stringify(defaultControlLayerVersions)}. Are you using an outdated library?`);
        }
        if (messageLayerVersion < 0) {
            throw new Error(`Supported MessageLayer versions: ${JSON.stringify(defaultMessageLayerVersions)}. Are you using an outdated library?`);
        }
        return [controlLayerVersion, messageLayerVersion];
    }
}
exports.NegotiatedProtocolVersions = NegotiatedProtocolVersions;
//# sourceMappingURL=NegotiatedProtocolVersions.js.map