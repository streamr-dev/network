"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtcSignaller = void 0;
const NodeToTracker_1 = require("../protocol/NodeToTracker");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class RtcSignaller {
    constructor(peerInfo, nodeToTracker) {
        this.peerInfo = peerInfo;
        this.nodeToTracker = nodeToTracker;
        this.offerListener = null;
        this.answerListener = null;
        this.iceCandidateListener = null;
        this.connectListener = null;
        this.errorListener = null;
        nodeToTracker.on(NodeToTracker_1.Event.RELAY_MESSAGE_RECEIVED, (relayMessage, source) => {
            const { originator, targetNode, subType } = relayMessage;
            if (relayMessage.isRtcOfferMessage()) {
                this.offerListener({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    description: relayMessage.data.description
                });
            }
            else if (relayMessage.isRtcAnswerMessage()) {
                this.answerListener({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    description: relayMessage.data.description,
                });
            }
            else if (relayMessage.isIceCandidateMessage()) {
                this.iceCandidateListener({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    candidate: relayMessage.data.candidate,
                    mid: relayMessage.data.mid
                });
            }
            else if (relayMessage.isRtcConnectMessage()) {
                this.connectListener({
                    routerId: source,
                    targetNode,
                    originatorInfo: originator,
                });
            }
            else {
                logger.warn('Encountered unrecognized subtype', { subType, content: relayMessage });
            }
        });
        nodeToTracker.on(NodeToTracker_1.Event.RTC_ERROR_RECEIVED, (message, source) => {
            this.errorListener({
                routerId: source,
                targetNode: message.targetNode,
                errorCode: message.errorCode
            });
        });
    }
    sendRtcOffer(routerId, targetPeerId, connectionId, description) {
        this.nodeToTracker.sendRtcOffer(routerId, targetPeerId, connectionId, this.peerInfo, description)
            .catch((err) => {
            logger.debug('Failed to sendRtcOffer', { routerId, err }); // TODO: better?
        });
    }
    sendRtcAnswer(routerId, targetPeerId, connectionId, description) {
        this.nodeToTracker.sendRtcAnswer(routerId, targetPeerId, connectionId, this.peerInfo, description)
            .catch((err) => {
            logger.debug('Failed to sendRtcAnswer', { routerId, err }); // TODO: better?
        });
    }
    sendRtcIceCandidate(routerId, targetPeerId, connectionId, candidate, mid) {
        this.nodeToTracker.sendRtcIceCandidate(routerId, targetPeerId, connectionId, this.peerInfo, candidate, mid)
            .catch((err) => {
            logger.debug('Failed to sendRtcIceCandidate', { routerId, err }); // TODO: better?
        });
    }
    sendRtcConnect(routerId, targetPeerId) {
        this.nodeToTracker.sendRtcConnect(routerId, targetPeerId, this.peerInfo)
            .catch((err) => {
            logger.debug('Failed to sendRtcConnect', { routerId, err }); // TODO: better?
        });
    }
    setOfferListener(fn) {
        this.offerListener = fn;
    }
    setAnswerListener(fn) {
        this.answerListener = fn;
    }
    setIceCandidateListener(fn) {
        this.iceCandidateListener = fn;
    }
    setErrorListener(fn) {
        this.errorListener = fn;
    }
    setConnectListener(fn) {
        this.connectListener = fn;
    }
}
exports.RtcSignaller = RtcSignaller;
//# sourceMappingURL=RtcSignaller.js.map