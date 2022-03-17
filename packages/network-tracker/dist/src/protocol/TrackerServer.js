"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerServer = exports.Event = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const streamr_client_protocol_1 = require("streamr-client-protocol");
const streamr_network_1 = require("streamr-network");
var Event;
(function (Event) {
    Event["NODE_CONNECTED"] = "streamr:tracker:send-peers";
    Event["NODE_DISCONNECTED"] = "streamr:tracker:node-disconnected";
    Event["NODE_STATUS_RECEIVED"] = "streamr:tracker:peer-status";
    Event["RELAY_MESSAGE_RECEIVED"] = "streamr:tracker:relay-message-received";
})(Event = exports.Event || (exports.Event = {}));
const eventPerType = {};
eventPerType[streamr_client_protocol_1.TrackerLayer.TrackerMessage.TYPES.StatusMessage] = Event.NODE_STATUS_RECEIVED;
eventPerType[streamr_client_protocol_1.TrackerLayer.TrackerMessage.TYPES.RelayMessage] = Event.RELAY_MESSAGE_RECEIVED;
class TrackerServer extends events_1.EventEmitter {
    constructor(endpoint) {
        super();
        this.endpoint = endpoint;
        endpoint.on(streamr_network_1.Event.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo));
        endpoint.on(streamr_network_1.Event.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo));
        endpoint.on(streamr_network_1.Event.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message));
        this.logger = new streamr_network_1.Logger(module);
    }
    async sendInstruction(receiverNodeId, streamPartId, nodeIds, counter) {
        const [streamId, streamPartition] = streamr_client_protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        await this.send(receiverNodeId, new streamr_client_protocol_1.TrackerLayer.InstructionMessage({
            requestId: (0, uuid_1.v4)(),
            streamId,
            streamPartition,
            nodeIds,
            counter
        }));
    }
    async sendRtcOffer(receiverNodeId, requestId, originatorInfo, connectionId, description) {
        await this.send(receiverNodeId, new streamr_client_protocol_1.TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: streamr_network_1.RtcSubTypes.RTC_OFFER,
            data: {
                connectionId,
                description
            }
        }));
    }
    async sendRtcAnswer(receiverNodeId, requestId, originatorInfo, connectionId, description) {
        await this.send(receiverNodeId, new streamr_client_protocol_1.TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: streamr_network_1.RtcSubTypes.RTC_ANSWER,
            data: {
                connectionId,
                description
            }
        }));
    }
    async sendRtcConnect(receiverNodeId, requestId, originatorInfo) {
        await this.send(receiverNodeId, new streamr_client_protocol_1.TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: streamr_network_1.RtcSubTypes.RTC_CONNECT,
            data: new Object()
        }));
    }
    async sendRtcIceCandidate(receiverNodeId, requestId, originatorInfo, connectionId, candidate, mid) {
        await this.send(receiverNodeId, new streamr_client_protocol_1.TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: streamr_network_1.RtcSubTypes.ICE_CANDIDATE,
            data: {
                connectionId,
                candidate,
                mid
            }
        }));
    }
    async sendUnknownPeerRtcError(receiverNodeId, requestId, targetNode) {
        await this.send(receiverNodeId, new streamr_client_protocol_1.TrackerLayer.ErrorMessage({
            requestId,
            errorCode: streamr_client_protocol_1.TrackerLayer.ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode
        }));
    }
    async send(receiverNodeId, message) {
        this.logger.debug(`Send ${streamr_client_protocol_1.TrackerMessageType[message.type]} to ${streamr_network_1.NameDirectory.getName(receiverNodeId)}`);
        await this.endpoint.send(receiverNodeId, message.serialize());
    }
    getNodeIds() {
        return this.endpoint.getPeerInfos()
            .filter((peerInfo) => peerInfo.isNode())
            .map((peerInfo) => peerInfo.peerId);
    }
    getUrl() {
        return this.endpoint.getUrl();
    }
    resolveAddress(peerId) {
        return this.endpoint.resolveAddress(peerId);
    }
    stop() {
        return this.endpoint.stop();
    }
    onPeerConnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(Event.NODE_CONNECTED, peerInfo.peerId);
        }
    }
    onPeerDisconnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(Event.NODE_DISCONNECTED, peerInfo.peerId);
        }
    }
    disconnectFromPeer(peerId, code = streamr_network_1.DisconnectionCode.GRACEFUL_SHUTDOWN, reason = streamr_network_1.DisconnectionReason.GRACEFUL_SHUTDOWN) {
        this.endpoint.close(peerId, code, reason);
    }
    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isNode()) {
            const message = (0, streamr_network_1.decode)(rawMessage, streamr_client_protocol_1.TrackerLayer.TrackerMessage.deserialize);
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId);
            }
            else {
                this.logger.warn('invalid message from %s: %s', peerInfo, rawMessage);
            }
        }
    }
}
exports.TrackerServer = TrackerServer;
//# sourceMappingURL=TrackerServer.js.map