"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisconnectionManager = void 0;
const NameDirectory_1 = require("../NameDirectory");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
/**
 * DisconnectionManager assists a network node in disconnecting from other nodes when streams are
 * no longer shared between them.
 *
 * There are two ways this is achieved:
 *  1. Manual: a node can schedule (and cancel) disconnections that get executed after `disconnectionDelayInMs` if
 *      they still don't share streams.
 *  2. Automatic: a clean up interval is ran periodically in which any node without shared streams gets disconnected
 *      from.
 */
class DisconnectionManager {
    constructor({ getAllNodes, hasSharedStreamParts: hasSharedStreams, disconnect, disconnectionDelayInMs, cleanUpIntervalInMs }) {
        this.disconnectionTimers = new Map();
        this.connectionCleanUpInterval = null;
        this.getAllNodes = getAllNodes;
        this.hasSharedStreams = hasSharedStreams;
        this.disconnect = disconnect;
        this.disconnectionDelayInMs = disconnectionDelayInMs;
        this.cleanUpIntervalInMs = cleanUpIntervalInMs;
    }
    start() {
        this.connectionCleanUpInterval = setInterval(() => {
            const nodeIds = this.getAllNodes();
            const nonNeighborNodeIds = nodeIds.filter((nodeId) => !this.hasSharedStreams(nodeId));
            if (nonNeighborNodeIds.length > 0) {
                logger.debug('Disconnect from nodes', {
                    nodeCount: nonNeighborNodeIds.length
                });
                nonNeighborNodeIds.forEach((nodeId) => {
                    this.loggedDisconnect(nodeId);
                });
            }
        }, this.cleanUpIntervalInMs);
    }
    stop() {
        clearInterval(this.connectionCleanUpInterval);
        this.disconnectionTimers.forEach((timeout) => {
            clearTimeout(timeout);
        });
    }
    scheduleDisconnectionIfNoSharedStreamParts(nodeId) {
        if (!this.hasSharedStreams(nodeId)) {
            this.cancelScheduledDisconnection(nodeId);
            this.disconnectionTimers.set(nodeId, setTimeout(() => {
                this.disconnectionTimers.delete(nodeId);
                if (!this.hasSharedStreams(nodeId)) {
                    this.loggedDisconnect(nodeId);
                }
            }, this.disconnectionDelayInMs));
            logger.trace('Schedule disconnection from node', {
                nodeId,
                delayInMs: this.disconnectionDelayInMs
            });
        }
    }
    cancelScheduledDisconnection(nodeId) {
        const timeout = this.disconnectionTimers.get(nodeId);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this.disconnectionTimers.delete(nodeId);
            logger.trace('Cancel scheduled disconnection from node', { nodeId });
        }
    }
    loggedDisconnect(nodeId) {
        logger.trace('loggedDisconnect', {
            nodeId: NameDirectory_1.NameDirectory.getName(nodeId)
        });
        this.disconnect(nodeId, DisconnectionManager.DISCONNECTION_REASON);
    }
}
exports.DisconnectionManager = DisconnectionManager;
DisconnectionManager.DISCONNECTION_REASON = 'no shared streams';
//# sourceMappingURL=DisconnectionManager.js.map