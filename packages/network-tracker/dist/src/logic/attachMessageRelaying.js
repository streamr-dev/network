"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachMessageRelaying = void 0;
const TrackerServer_1 = require("../protocol/TrackerServer");
const network_node_1 = require("@streamr/network-node");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
function attachMessageRelaying(trackerServer) {
    trackerServer.on(TrackerServer_1.Event.RELAY_MESSAGE_RECEIVED, async (relayMessage, _source) => {
        const { subType, requestId, originator, targetNode } = relayMessage;
        // TODO: validate that source === originator
        try {
            await trackerServer.send(relayMessage.targetNode, relayMessage);
        }
        catch (err) {
            if (err.code === network_node_1.UnknownPeerError.CODE) {
                trackerServer.sendUnknownPeerError(originator.peerId, requestId, targetNode)
                    .catch((err) => {
                    logger.error('Failed to send UNKNOWN_PEER error response', {
                        err,
                        destination: originator.peerId,
                        unknownPeerId: targetNode
                    });
                });
            }
            else {
                logger.warn('Failed to relay message', {
                    subType,
                    targetNode,
                    err
                });
            }
        }
    });
}
exports.attachMessageRelaying = attachMessageRelaying;
//# sourceMappingURL=attachMessageRelaying.js.map