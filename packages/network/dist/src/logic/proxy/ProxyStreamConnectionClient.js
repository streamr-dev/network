"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyStreamConnectionClient = exports.retry = exports.Event = void 0;
const NodeToNode_1 = require("../../protocol/NodeToNode");
const Node_1 = require("../Node");
const protocol_1 = require("@streamr/protocol");
const utils_1 = require("@streamr/utils");
const sampleSize_1 = __importDefault(require("lodash/sampleSize"));
const events_1 = require("events");
const logger = new utils_1.Logger(module);
var Event;
(function (Event) {
    Event["CONNECTION_ACCEPTED"] = "proxy-connection-accepted";
    Event["CONNECTION_REJECTED"] = "proxy-connection-rejected";
})(Event || (exports.Event = Event = {}));
const retry = async (task, description, abortSignal, delay = 15000) => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const result = await task();
            return result;
        }
        catch (e) {
            logger.warn(`Failed ${description} (retrying after delay)`, {
                delayInMs: delay
            });
        }
        await (0, utils_1.wait)(delay, abortSignal);
    }
};
exports.retry = retry;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ProxyStreamConnectionClient extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.trackerManager = opts.trackerManager;
        this.streamPartManager = opts.streamPartManager;
        this.nodeToNode = opts.nodeToNode;
        this.node = opts.node;
        this.nodeConnectTimeout = opts.nodeConnectTimeout;
        this.propagation = opts.propagation;
        this.definitions = new Map();
        this.connections = new Map();
        this.abortController = new AbortController();
        this.nodeToNode.on(NodeToNode_1.Event.PROXY_CONNECTION_RESPONSE_RECEIVED, (message, nodeId) => {
            this.processHandshakeResponse(message, nodeId);
        });
    }
    async setProxies(streamPartId, nodeIds, direction, getUserId, connectionCount) {
        logger.trace('setProxies', { streamPartId });
        if (connectionCount !== undefined && connectionCount > nodeIds.length) {
            throw Error('Cannot set connectionCount above the size of the configured array of nodes');
        }
        if (this.streamPartManager.isSetUp(streamPartId) && !this.streamPartManager.isBehindProxy(streamPartId)) {
            throw Error(`Could not set ${direction} proxies for stream ${streamPartId}, non-proxy stream already exists`);
        }
        if (nodeIds.length > 0 && !this.streamPartManager.isSetUp(streamPartId)) {
            this.streamPartManager.setUpStreamPart(streamPartId, true);
        }
        this.definitions.set(streamPartId, {
            nodeIds: new Set(nodeIds),
            userId: await getUserId(),
            direction,
            connectionCount: connectionCount ?? nodeIds.length
        });
        await this.updateConnections(streamPartId);
    }
    async updateConnections(streamPartId) {
        await Promise.all(this.getInvalidConnections(streamPartId).map(async (id) => {
            await this.closeConnection(streamPartId, id);
        }));
        const connectionCountDiff = this.definitions.get(streamPartId).connectionCount - this.getConnections(streamPartId).size;
        if (connectionCountDiff > 0) {
            await this.openRandomConnections(streamPartId, connectionCountDiff);
        }
        else if (connectionCountDiff < 0) {
            await this.closeRandomConnections(streamPartId, -connectionCountDiff);
        }
    }
    getInvalidConnections(streamPartId) {
        return Array.from(this.getConnections(streamPartId).keys()).filter((id) => {
            const definition = this.definitions.get(streamPartId);
            return !definition.nodeIds.has(id)
                || definition.direction !== this.getConnections(streamPartId).get(id);
        });
    }
    async openRandomConnections(streamPartId, connectionCount) {
        const definition = this.definitions.get(streamPartId);
        const proxiesToAttempt = (0, sampleSize_1.default)(Array.from(definition.nodeIds.keys()).filter((id) => !this.getConnections(streamPartId).has(id)), connectionCount);
        await Promise.all(proxiesToAttempt.map((id) => this.attemptConnection(streamPartId, id, definition.direction, definition.userId)));
    }
    async attemptConnection(streamPartId, nodeId, direction, userId) {
        await Promise.all([
            this.waitForHandshake(streamPartId, nodeId, direction),
            this.initiateConnection(streamPartId, nodeId, direction, userId)
        ]);
    }
    async waitForHandshake(streamPartId, contactNodeId, direction) {
        const predicate = (node, stream, eventDirection) => {
            return node === contactNodeId && stream === streamPartId && direction === eventDirection;
        };
        await Promise.race([
            (0, utils_1.waitForEvent)(this, Event.CONNECTION_ACCEPTED, this.nodeConnectTimeout, predicate),
            (async () => {
                const result = await (0, utils_1.waitForEvent)(this, Event.CONNECTION_REJECTED, this.nodeConnectTimeout, predicate);
                throw new Error(`Joining stream as proxy ${direction} failed on contact-node ${contactNodeId} for stream ${streamPartId}`
                    + ` reason: ${result[3]}`);
            })()
        ]);
    }
    async initiateConnection(streamPartId, targetNodeId, direction, userId) {
        logger.info('Open proxy connection', {
            targetNodeId,
            streamPartId
        });
        try {
            await this.connectAndHandshake(streamPartId, targetNodeId, direction, userId);
        }
        catch (err) {
            logger.warn('Failed to create a proxy stream connection', {
                streamPartId,
                targetNodeId,
                direction,
                userId,
                err
            });
            this.emit(Event.CONNECTION_REJECTED, targetNodeId, streamPartId, direction, err);
        }
        finally {
            this.trackerManager.removeSignallingOnlySession(streamPartId, targetNodeId);
        }
    }
    async connectAndHandshake(streamPartId, targetNodeId, direction, userId) {
        await this.trackerManager.addSignallingOnlySession(streamPartId, targetNodeId);
        const trackerId = this.trackerManager.getTrackerId(streamPartId);
        await (0, utils_1.withTimeout)(this.nodeToNode.connectToNode(targetNodeId, trackerId, false), this.nodeConnectTimeout);
        await this.nodeToNode.requestProxyConnection(targetNodeId, streamPartId, direction, userId);
    }
    async closeRandomConnections(streamPartId, connectionCount) {
        const proxiesToDisconnect = (0, sampleSize_1.default)(Array.from(this.getConnections(streamPartId).keys()), connectionCount);
        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeConnection(streamPartId, node)));
    }
    async closeConnection(streamPartId, targetNodeId) {
        if (this.getConnections(streamPartId).has(targetNodeId)
            && this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)) {
            logger.info('Close proxy connection', {
                targetNodeId,
                streamPartId
            });
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, streamPartId);
            this.node.emit(Node_1.Event.ONE_WAY_CONNECTION_CLOSED, targetNodeId, streamPartId);
            this.removeConnection(streamPartId, targetNodeId);
        }
    }
    getConnections(streamPartId) {
        return this.connections.get(streamPartId) ?? new Map();
    }
    hasConnection(nodeId, streamPartId) {
        return this.getConnections(streamPartId).has(nodeId);
    }
    removeConnection(streamPartId, nodeId) {
        if (this.hasConnection(nodeId, streamPartId)) {
            this.connections.get(streamPartId).delete(nodeId);
        }
        this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId);
        if (this.definitions.get(streamPartId).nodeIds.size === 0 && this.getConnections(streamPartId).size === 0) {
            this.streamPartManager.removeStreamPart(streamPartId);
        }
    }
    processHandshakeResponse(message, nodeId) {
        const streamPartId = message.getStreamPartID();
        if (message.accepted) {
            if (!this.connections.has(streamPartId)) {
                this.connections.set(streamPartId, new Map());
            }
            this.connections.get(streamPartId).set(nodeId, message.direction);
            if (message.direction === protocol_1.ProxyDirection.PUBLISH) {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId);
                this.propagation.onNeighborJoined(nodeId, streamPartId);
            }
            else {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId);
            }
            this.emit(Event.CONNECTION_ACCEPTED, nodeId, streamPartId, message.direction);
        }
        else {
            this.emit(Event.CONNECTION_REJECTED, nodeId, streamPartId, message.direction, `Target node ${nodeId} rejected proxy ${message.direction} stream connection ${streamPartId}`);
        }
    }
    async onNodeDisconnected(streamPartId, nodeId) {
        this.removeConnection(streamPartId, nodeId);
        await (0, exports.retry)(() => this.updateConnections(streamPartId), 'updating proxy connections', this.abortController.signal);
    }
    isProxiedStreamPart(streamPartId, direction) {
        if (this.definitions.has(streamPartId)) {
            return this.definitions.get(streamPartId).direction === direction;
        }
        return false;
    }
    stop() {
        this.definitions.clear();
        this.abortController.abort();
    }
}
exports.ProxyStreamConnectionClient = ProxyStreamConnectionClient;
//# sourceMappingURL=ProxyStreamConnectionClient.js.map