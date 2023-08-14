"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeToTracker = exports.Event = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const protocol_1 = require("@streamr/protocol");
const utils_1 = require("@streamr/utils");
const utils_2 = require("./utils");
const NameDirectory_1 = require("../NameDirectory");
const AbstractWsEndpoint_1 = require("../connection/ws/AbstractWsEndpoint");
var Event;
(function (Event) {
    Event["CONNECTED_TO_TRACKER"] = "streamr:tracker-node:send-status";
    Event["TRACKER_DISCONNECTED"] = "streamr:tracker-node:tracker-disconnected";
    Event["TRACKER_INSTRUCTION_RECEIVED"] = "streamr:tracker-node:tracker-instruction-received";
    Event["STATUS_ACK_RECEIVED"] = "streamr:tracker-node:status-ack-received";
    Event["RELAY_MESSAGE_RECEIVED"] = "streamr:tracker-node:relay-message-received";
    Event["RTC_ERROR_RECEIVED"] = "streamr:tracker-node:rtc-error-received";
})(Event || (exports.Event = Event = {}));
const eventPerType = {};
eventPerType[protocol_1.TrackerMessage.TYPES.InstructionMessage] = Event.TRACKER_INSTRUCTION_RECEIVED;
eventPerType[protocol_1.TrackerMessage.TYPES.StatusAckMessage] = Event.STATUS_ACK_RECEIVED;
eventPerType[protocol_1.TrackerMessage.TYPES.RelayMessage] = Event.RELAY_MESSAGE_RECEIVED;
eventPerType[protocol_1.TrackerMessage.TYPES.ErrorMessage] = Event.RTC_ERROR_RECEIVED;
const logger = new utils_1.Logger(module);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class NodeToTracker extends events_1.EventEmitter {
    constructor(endpoint) {
        super();
        this.endpoint = endpoint;
        this.endpoint.on(AbstractWsEndpoint_1.Event.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo));
        this.endpoint.on(AbstractWsEndpoint_1.Event.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo));
        this.endpoint.on(AbstractWsEndpoint_1.Event.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message));
    }
    async sendStatus(trackerId, status) {
        const requestId = (0, uuid_1.v4)();
        await this.send(trackerId, new protocol_1.StatusMessage({
            requestId,
            status
        }));
        return requestId;
    }
    async sendRtcOffer(trackerId, targetNode, connectionId, originatorInfo, description) {
        const requestId = (0, uuid_1.v4)();
        await this.send(trackerId, new protocol_1.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: protocol_1.RelayMessageSubType.RTC_OFFER,
            data: {
                connectionId,
                description
            }
        }));
        return requestId;
    }
    async sendRtcAnswer(trackerId, targetNode, connectionId, originatorInfo, description) {
        const requestId = (0, uuid_1.v4)();
        await this.send(trackerId, new protocol_1.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: protocol_1.RelayMessageSubType.RTC_ANSWER,
            data: {
                connectionId,
                description
            }
        }));
        return requestId;
    }
    async sendRtcIceCandidate(trackerId, targetNode, connectionId, originatorInfo, candidate, mid) {
        const requestId = (0, uuid_1.v4)();
        await this.send(trackerId, new protocol_1.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: protocol_1.RelayMessageSubType.ICE_CANDIDATE,
            data: {
                connectionId,
                candidate,
                mid
            }
        }));
        return requestId;
    }
    async sendRtcConnect(trackerId, targetNode, originatorInfo) {
        const requestId = (0, uuid_1.v4)();
        await this.send(trackerId, new protocol_1.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: protocol_1.RelayMessageSubType.RTC_CONNECT,
            data: {}
        }));
        return requestId;
    }
    async send(receiverTrackerId, message) {
        await this.endpoint.send(receiverTrackerId, message.serialize());
    }
    getServerUrlByTrackerId(trackerId) {
        return this.endpoint.getServerUrlByPeerId(trackerId);
    }
    getDiagnosticInfo() {
        return this.endpoint.getDiagnosticInfo();
    }
    stop() {
        return this.endpoint.stop();
    }
    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isTracker()) {
            const message = (0, utils_2.decode)(rawMessage, protocol_1.TrackerMessage.deserialize);
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId);
            }
            else {
                logger.warn('Drop invalid message', { sender: peerInfo.peerId, rawMessage });
            }
        }
    }
    connectToTracker(trackerAddress, trackerPeerInfo) {
        return this.endpoint.connect(trackerAddress, trackerPeerInfo);
    }
    disconnectFromTracker(trackerId) {
        this.endpoint.close(trackerId, 1000, AbstractWsEndpoint_1.DisconnectionReason.NO_SHARED_STREAM_PARTS);
    }
    onPeerConnected(peerInfo) {
        if (peerInfo.isTracker()) {
            logger.debug('Connected to tracker', { trackerId: NameDirectory_1.NameDirectory.getName(peerInfo.peerId) });
            this.emit(Event.CONNECTED_TO_TRACKER, peerInfo.peerId);
        }
    }
    onPeerDisconnected(peerInfo) {
        if (peerInfo.isTracker()) {
            this.emit(Event.TRACKER_DISCONNECTED, peerInfo.peerId);
        }
    }
}
exports.NodeToTracker = NodeToTracker;
//# sourceMappingURL=NodeToTracker.js.map