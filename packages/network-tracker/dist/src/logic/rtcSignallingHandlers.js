"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRtcSignalling = void 0;
const TrackerServer_1 = require("../protocol/TrackerServer");
const streamr_network_1 = require("streamr-network");
function attachRtcSignalling(trackerServer) {
    if (!(trackerServer instanceof TrackerServer_1.TrackerServer)) {
        throw new Error('trackerServer not instance of TrackerServer');
    }
    const logger = new streamr_network_1.Logger(module);
    async function handleRtcOffer({ requestId, originator, targetNode, data }) {
        return trackerServer.sendRtcOffer(targetNode, requestId, originator, data.connectionId, data.description).catch((err) => {
            logger.debug('failed to sendRtcOffer to %s due to %s', targetNode, err); // TODO: better?
            throw err;
        });
    }
    async function handleRtcAnswer({ requestId, originator, targetNode, data }) {
        return trackerServer.sendRtcAnswer(targetNode, requestId, originator, data.connectionId, data.description).catch((err) => {
            logger.debug('failed to sendRtcAnswer to %s due to %s', targetNode, err); // TODO: better?
            throw err;
        });
    }
    async function handleIceCandidate({ requestId, originator, targetNode, data }) {
        return trackerServer.sendRtcIceCandidate(targetNode, requestId, originator, data.connectionId, data.candidate, data.mid).catch((err) => {
            logger.debug('failed to sendRemoteCandidate to %s due to %s', targetNode, err); // TODO: better?
            throw err;
        });
    }
    async function handleRtcConnect({ requestId, originator, targetNode }) {
        return trackerServer.sendRtcConnect(targetNode, requestId, originator).catch((err) => {
            logger.debug('Failed to sendRtcConnect to %s due to %s', targetNode, err); // TODO: better?
            throw err;
        });
    }
    trackerServer.on(TrackerServer_1.Event.RELAY_MESSAGE_RECEIVED, async (relayMessage, _source) => {
        const { subType, requestId, originator, targetNode, } = relayMessage;
        // TODO: validate that source === originator
        try {
            if (relayMessage.subType === streamr_network_1.RtcSubTypes.RTC_OFFER) {
                await handleRtcOffer(relayMessage);
            }
            else if (relayMessage.subType === streamr_network_1.RtcSubTypes.RTC_ANSWER) {
                await handleRtcAnswer(relayMessage);
            }
            else if (relayMessage.subType === streamr_network_1.RtcSubTypes.ICE_CANDIDATE) {
                await handleIceCandidate(relayMessage);
            }
            else if (relayMessage.subType === streamr_network_1.RtcSubTypes.RTC_CONNECT) {
                await handleRtcConnect(relayMessage);
            }
            else {
                logger.warn('unrecognized RelayMessage subType %s with contents %o', subType, relayMessage);
            }
        }
        catch (err) {
            if (err.code === streamr_network_1.UnknownPeerError.CODE) {
                trackerServer.sendUnknownPeerRtcError(originator.peerId, requestId, targetNode)
                    .catch((e) => logger.error('failed to sendUnknownPeerRtcError, reason: %s', e));
            }
            else {
                logger.warn('failed to relay message %s to %s, reason: %s', subType, targetNode, err);
            }
        }
    });
}
exports.attachRtcSignalling = attachRtcSignalling;
//# sourceMappingURL=rtcSignallingHandlers.js.map