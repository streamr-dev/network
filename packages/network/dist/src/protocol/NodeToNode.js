"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeToNode = exports.Event = void 0;
const events_1 = require("events");
const protocol_1 = require("@streamr/protocol");
const utils_1 = require("@streamr/utils");
const utils_2 = require("./utils");
const IWebRtcEndpoint_1 = require("../connection/webrtc/IWebRtcEndpoint");
var Event;
(function (Event) {
    Event["NODE_CONNECTED"] = "streamr:node-node:node-connected";
    Event["NODE_DISCONNECTED"] = "streamr:node-node:node-disconnected";
    Event["DATA_RECEIVED"] = "streamr:node-node:stream-data";
    Event["LOW_BACK_PRESSURE"] = "streamr:node-node:low-back-pressure";
    Event["HIGH_BACK_PRESSURE"] = "streamr:node-node:high-back-pressure";
    Event["PROXY_CONNECTION_REQUEST_RECEIVED"] = "node-node:publish-only-stream-request-received";
    Event["PROXY_CONNECTION_RESPONSE_RECEIVED"] = "node-node:publish-only-stream-response-received";
    Event["LEAVE_REQUEST_RECEIVED"] = "node-node:leave-request-received";
})(Event || (exports.Event = Event = {}));
const eventPerType = {};
eventPerType[protocol_1.ControlMessage.TYPES.BroadcastMessage] = Event.DATA_RECEIVED;
eventPerType[protocol_1.ControlMessage.TYPES.ProxyConnectionRequest] = Event.PROXY_CONNECTION_REQUEST_RECEIVED;
eventPerType[protocol_1.ControlMessage.TYPES.ProxyConnectionResponse] = Event.PROXY_CONNECTION_RESPONSE_RECEIVED;
eventPerType[protocol_1.ControlMessage.TYPES.UnsubscribeRequest] = Event.LEAVE_REQUEST_RECEIVED;
const logger = new utils_1.Logger(module);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class NodeToNode extends events_1.EventEmitter {
    constructor(endpoint) {
        super();
        this.endpoint = endpoint;
        endpoint.on(IWebRtcEndpoint_1.Event.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo));
        endpoint.on(IWebRtcEndpoint_1.Event.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo));
        endpoint.on(IWebRtcEndpoint_1.Event.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message));
        endpoint.on(IWebRtcEndpoint_1.Event.LOW_BACK_PRESSURE, (peerInfo) => this.onLowBackPressure(peerInfo));
        endpoint.on(IWebRtcEndpoint_1.Event.HIGH_BACK_PRESSURE, (peerInfo) => this.onHighBackPressure(peerInfo));
    }
    connectToNode(receiverNodeId, trackerId, trackerInstructed = true) {
        return this.endpoint.connect(receiverNodeId, trackerId, trackerInstructed);
    }
    sendData(receiverNodeId, streamMessage) {
        return this.send(receiverNodeId, new protocol_1.BroadcastMessage({
            requestId: '',
            streamMessage,
        }));
    }
    send(receiverNodeId, message) {
        const [controlLayerVersion, messageLayerVersion] = this.getNegotiatedProtocolVersionsOnNode(receiverNodeId);
        return this.endpoint.send(receiverNodeId, message.serialize(controlLayerVersion, messageLayerVersion)).then(() => message);
    }
    disconnectFromNode(receiverNodeId, reason) {
        this.endpoint.close(receiverNodeId, reason);
    }
    /**
     * @deprecated
     */
    getAddress() {
        return this.endpoint.getAddress();
    }
    stop() {
        this.endpoint.stop();
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
    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isNode()) {
            const message = (0, utils_2.decode)(rawMessage, protocol_1.ControlMessage.deserialize);
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId);
            }
            else {
                logger.warn('Drop invalid message', { sender: peerInfo.peerId, rawMessage });
            }
        }
    }
    onLowBackPressure(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(Event.LOW_BACK_PRESSURE, peerInfo.peerId);
        }
    }
    onHighBackPressure(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(Event.HIGH_BACK_PRESSURE, peerInfo.peerId);
        }
    }
    getRtts() {
        return this.endpoint.getRtts();
    }
    getNegotiatedProtocolVersionsOnNode(nodeId) {
        const messageLayerVersion = this.endpoint.getNegotiatedMessageLayerProtocolVersionOnNode(nodeId)
            || this.endpoint.getDefaultMessageLayerProtocolVersion();
        const controlLayerVersion = this.endpoint.getNegotiatedControlLayerProtocolVersionOnNode(nodeId)
            || this.endpoint.getDefaultControlLayerProtocolVersion();
        return [controlLayerVersion, messageLayerVersion];
    }
    async requestProxyConnection(nodeId, streamPartId, direction, userId) {
        const [streamId, streamPartition] = protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        await this.send(nodeId, new protocol_1.ProxyConnectionRequest({
            requestId: '',
            senderId: nodeId,
            streamId,
            streamPartition,
            userId,
            direction
        }));
    }
    async leaveStreamOnNode(nodeId, streamPartId) {
        const [streamId, streamPartition] = protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        await this.send(nodeId, new protocol_1.UnsubscribeRequest({
            requestId: '',
            streamId,
            streamPartition
        }));
    }
    async respondToProxyConnectionRequest(nodeId, streamPartId, direction, accepted) {
        const [streamId, streamPartition] = protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        await this.send(nodeId, new protocol_1.ProxyConnectionResponse({
            requestId: '',
            senderId: nodeId,
            streamId,
            streamPartition,
            direction,
            accepted
        }));
    }
    getAllConnectionNodeIds() {
        return this.endpoint.getAllConnectionNodeIds();
    }
    getDiagnosticInfo() {
        return this.endpoint.getDiagnosticInfo();
    }
}
exports.NodeToNode = NodeToNode;
//# sourceMappingURL=NodeToNode.js.map