"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyStreamConnectionServer = void 0;
const NodeToNode_1 = require("../../protocol/NodeToNode");
const Node_1 = require("../Node");
const protocol_1 = require("@streamr/protocol");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class ProxyStreamConnectionServer {
    constructor(opts) {
        this.streamPartManager = opts.streamPartManager;
        this.nodeToNode = opts.nodeToNode;
        this.node = opts.node;
        this.acceptProxyConnections = opts.acceptProxyConnections;
        this.propagation = opts.propagation;
        this.connections = new Map();
        this.nodeToNode.on(NodeToNode_1.Event.PROXY_CONNECTION_REQUEST_RECEIVED, (message, nodeId) => {
            this.processHandshakeRequest(message, nodeId);
        });
        this.nodeToNode.on(NodeToNode_1.Event.LEAVE_REQUEST_RECEIVED, (message, nodeId) => {
            this.processLeaveRequest(message, nodeId);
        });
    }
    async processHandshakeRequest(message, nodeId) {
        const streamPartId = message.getStreamPartID();
        const isAccepted = this.acceptProxyConnections && this.streamPartManager.isSetUp(streamPartId);
        await this.nodeToNode.respondToProxyConnectionRequest(nodeId, streamPartId, message.direction, isAccepted);
        if (isAccepted) {
            this.addConnection(streamPartId, nodeId, message.direction, message.userId);
            if (message.direction === protocol_1.ProxyDirection.PUBLISH) {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId);
            }
            else {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId);
                this.propagation.onNeighborJoined(nodeId, streamPartId);
            }
        }
    }
    addConnection(streamPartId, nodeId, direction, userId) {
        if (!this.connections.has(streamPartId)) {
            this.connections.set(streamPartId, new Map());
        }
        this.connections.get(streamPartId).set(nodeId, {
            direction,
            userId
        });
    }
    processLeaveRequest(message, nodeId) {
        const streamPartId = message.getStreamPartID();
        this.removeConnection(streamPartId, nodeId);
        this.node.emit(Node_1.Event.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId);
        logger.info('Processed leave request by proxy node', {
            nodeId,
            streamPartId
        });
    }
    removeConnection(streamPartId, nodeId) {
        if (this.hasConnection(streamPartId, nodeId)) {
            this.connections.get(streamPartId).delete(nodeId);
            if (this.connections.get(streamPartId).size === 0) {
                this.connections.delete(streamPartId);
            }
            this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId);
        }
    }
    hasConnection(streamPartId, nodeId) {
        return this.connections.has(streamPartId) && this.connections.get(streamPartId).has(nodeId);
    }
    getNodeIdsForUserId(streamPartId, userId) {
        const connections = this.connections.get(streamPartId);
        return connections ? Array.from(connections.keys()).filter((nodeId) => connections.get(nodeId).userId === userId) : [];
    }
    stop() {
        this.connections.clear();
    }
}
exports.ProxyStreamConnectionServer = ProxyStreamConnectionServer;
//# sourceMappingURL=ProxyStreamConnectionServer.js.map