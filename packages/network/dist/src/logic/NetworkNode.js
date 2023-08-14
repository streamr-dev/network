"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkNode = void 0;
const protocol_1 = require("@streamr/protocol");
const Node_1 = require("./Node");
/*
Convenience wrapper for building client-facing functionality. Used by client.
 */
class NetworkNode extends Node_1.Node {
    constructor(opts) {
        const networkOpts = {
            ...opts
        };
        super(networkOpts);
    }
    setExtraMetadata(metadata) {
        this.extraMetadata = metadata;
    }
    publish(streamMessage) {
        const streamPartId = streamMessage.getStreamPartID();
        if (this.isProxiedStreamPart(streamPartId, protocol_1.ProxyDirection.SUBSCRIBE) && streamMessage.messageType === protocol_1.StreamMessageType.MESSAGE) {
            throw new Error(`Cannot publish content data to ${streamPartId} as proxy subscribe connections have been set`);
        }
        this.subscribeToStreamIfHaveNotYet(streamPartId);
        this.onDataReceived(streamMessage);
    }
    async setProxies(streamPartId, contactNodeIds, direction, getUserId, connectionCount) {
        if (this.acceptProxyConnections) {
            throw new Error('cannot set proxies when acceptProxyConnections=true');
        }
        await this.doSetProxies(streamPartId, contactNodeIds, direction, getUserId, connectionCount);
    }
    addMessageListener(cb) {
        this.on(Node_1.Event.UNSEEN_MESSAGE_RECEIVED, cb);
    }
    removeMessageListener(cb) {
        this.off(Node_1.Event.UNSEEN_MESSAGE_RECEIVED, cb);
    }
    subscribe(streamPartId) {
        if (this.isProxiedStreamPart(streamPartId, protocol_1.ProxyDirection.PUBLISH)) {
            throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`);
        }
        this.subscribeToStreamIfHaveNotYet(streamPartId);
    }
    async subscribeAndWaitForJoin(streamPartId, timeout) {
        if (this.isProxiedStreamPart(streamPartId, protocol_1.ProxyDirection.PUBLISH)) {
            throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`);
        }
        return this.subscribeAndWaitForJoinOperation(streamPartId, timeout);
    }
    async waitForJoinAndPublish(streamMessage, timeout) {
        const streamPartId = streamMessage.getStreamPartID();
        if (this.isProxiedStreamPart(streamPartId, protocol_1.ProxyDirection.SUBSCRIBE)) {
            throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`);
        }
        const numOfNeighbors = await this.subscribeAndWaitForJoin(streamPartId, timeout);
        this.onDataReceived(streamMessage);
        return numOfNeighbors;
    }
    unsubscribe(streamPartId) {
        this.unsubscribeFromStream(streamPartId);
    }
    getNeighborsForStreamPart(streamPartId) {
        return this.streamPartManager.isSetUp(streamPartId)
            ? this.streamPartManager.getNeighborsForStreamPart(streamPartId)
            : [];
    }
    hasStreamPart(streamPartId) {
        return this.streamPartManager.isSetUp(streamPartId);
    }
    hasProxyConnection(streamPartId, contactNodeId, direction) {
        if (direction === protocol_1.ProxyDirection.PUBLISH) {
            return this.streamPartManager.hasOutOnlyConnection(streamPartId, contactNodeId);
        }
        else if (direction === protocol_1.ProxyDirection.SUBSCRIBE) {
            return this.streamPartManager.hasInOnlyConnection(streamPartId, contactNodeId);
        }
        else {
            throw new Error(`Assertion failed expected ProxyDirection but received ${direction}`);
        }
    }
    getRtt(nodeId) {
        return this.nodeToNode.getRtts()[nodeId];
    }
}
exports.NetworkNode = NetworkNode;
//# sourceMappingURL=NetworkNode.js.map