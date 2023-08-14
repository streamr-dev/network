"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeerInfo = exports.PeerType = void 0;
const protocol_1 = require("@streamr/protocol");
var PeerType;
(function (PeerType) {
    PeerType["Tracker"] = "tracker";
    PeerType["Node"] = "node";
    PeerType["Unknown"] = "unknown";
})(PeerType || (exports.PeerType = PeerType = {}));
const defaultControlLayerVersions = protocol_1.ControlMessage.getSupportedVersions();
const defaultMessageLayerVersions = protocol_1.StreamMessage.getSupportedVersions();
class PeerInfo {
    static newTracker(peerId, controlLayerVersions, messageLayerVersions, location) {
        return new PeerInfo(peerId, PeerType.Tracker, controlLayerVersions || defaultControlLayerVersions, messageLayerVersions || defaultMessageLayerVersions, location);
    }
    static newNode(peerId, controlLayerVersions, messageLayerVersions, location) {
        return new PeerInfo(peerId, PeerType.Node, controlLayerVersions || defaultControlLayerVersions, messageLayerVersions || defaultMessageLayerVersions, location);
    }
    static newUnknown(peerId) {
        return new PeerInfo(peerId, PeerType.Unknown, defaultControlLayerVersions, defaultMessageLayerVersions);
    }
    static fromObject({ peerId, peerType, location, controlLayerVersions, messageLayerVersions }) {
        return new PeerInfo(peerId, peerType, controlLayerVersions || defaultControlLayerVersions, messageLayerVersions || defaultMessageLayerVersions, location ?? undefined);
    }
    constructor(peerId, peerType, controlLayerVersions, messageLayerVersions, location) {
        if (!peerId) {
            throw new Error('peerId not given');
        }
        if (!peerType) {
            throw new Error('peerType not given');
        }
        if (!Object.values(PeerType).includes(peerType)) {
            throw new Error(`peerType ${peerType} not in peerTypes list`);
        }
        if (!controlLayerVersions || controlLayerVersions.length === 0) {
            throw new Error('controlLayerVersions not given');
        }
        if (!messageLayerVersions || messageLayerVersions.length === 0) {
            throw new Error('messageLayerVersions not given');
        }
        this.peerId = peerId;
        this.peerType = peerType;
        this.controlLayerVersions = controlLayerVersions;
        this.messageLayerVersions = messageLayerVersions;
        this.location = location;
    }
    isTracker() {
        return this.peerType === PeerType.Tracker;
    }
    isNode() {
        return this.peerType === PeerType.Node;
    }
    toString() {
        return `<${this.peerId.slice(0, 8)}>`;
    }
}
exports.PeerInfo = PeerInfo;
//# sourceMappingURL=PeerInfo.js.map