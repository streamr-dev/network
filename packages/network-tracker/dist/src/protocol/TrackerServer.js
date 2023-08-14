"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerServer = exports.Event = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const protocol_1 = require("@streamr/protocol");
const network_node_1 = require("@streamr/network-node");
const utils_1 = require("@streamr/utils");
var Event;
(function (Event) {
    Event["NODE_CONNECTED"] = "streamr:tracker:send-peers";
    Event["NODE_DISCONNECTED"] = "streamr:tracker:node-disconnected";
    Event["NODE_STATUS_RECEIVED"] = "streamr:tracker:peer-status";
    Event["RELAY_MESSAGE_RECEIVED"] = "streamr:tracker:relay-message-received";
})(Event || (exports.Event = Event = {}));
const eventPerType = {};
eventPerType[protocol_1.TrackerMessage.TYPES.StatusMessage] = Event.NODE_STATUS_RECEIVED;
eventPerType[protocol_1.TrackerMessage.TYPES.RelayMessage] = Event.RELAY_MESSAGE_RECEIVED;
const logger = new utils_1.Logger(module);
class TrackerServer extends events_1.EventEmitter {
    constructor(endpoint) {
        super();
        this.endpoint = endpoint;
        endpoint.on(network_node_1.WsEndpointEvent.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo));
        endpoint.on(network_node_1.WsEndpointEvent.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo));
        endpoint.on(network_node_1.WsEndpointEvent.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message));
    }
    async sendInstruction(receiverNodeId, streamPartId, nodeIds, counter) {
        const [streamId, streamPartition] = protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        await this.send(receiverNodeId, new protocol_1.InstructionMessage({
            requestId: (0, uuid_1.v4)(),
            streamId,
            streamPartition,
            nodeIds,
            counter
        }));
    }
    async sendStatusAck(receiverNodeId, streamPartId) {
        const [streamId, streamPartition] = protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        await this.send(receiverNodeId, new protocol_1.StatusAckMessage({
            requestId: (0, uuid_1.v4)(),
            streamId,
            streamPartition
        }));
    }
    async sendUnknownPeerError(receiverNodeId, requestId, targetNode) {
        await this.send(receiverNodeId, new protocol_1.ErrorMessage({
            requestId,
            errorCode: protocol_1.ErrorMessage.ERROR_CODES.UNKNOWN_PEER,
            targetNode
        }));
    }
    async send(receiverNodeId, message) {
        logger.debug('Send message to node', {
            msgType: protocol_1.TrackerMessageType[message.type],
            nodeId: network_node_1.NameDirectory.getName(receiverNodeId)
        });
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
    disconnectFromPeer(peerId, code = network_node_1.DisconnectionCode.GRACEFUL_SHUTDOWN, reason = network_node_1.DisconnectionReason.GRACEFUL_SHUTDOWN) {
        this.endpoint.close(peerId, code, reason);
    }
    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isNode()) {
            const message = (0, network_node_1.decode)(rawMessage, protocol_1.TrackerMessage.deserialize);
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId);
            }
            else {
                logger.warn('Drop invalid message', {
                    sender: peerInfo.peerId,
                    rawMessage
                });
            }
        }
    }
}
exports.TrackerServer = TrackerServer;
//# sourceMappingURL=TrackerServer.js.map