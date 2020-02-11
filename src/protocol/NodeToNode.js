const { EventEmitter } = require('events')

const { ControlLayer } = require('streamr-client-protocol')

const encoder = require('../helpers/MessageEncoder')
const { msgTypes } = require('../messages/messageTypes')
const endpointEvents = require('../connection/WsEndpoint').events

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:node-node:node-connected',
    SUBSCRIBE_REQUEST: 'streamr:node-node:subscribe-request',
    UNSUBSCRIBE_REQUEST: 'streamr:node-node:unsubscribe-request',
    DATA_RECEIVED: 'streamr:node-node:stream-data',
    NODE_DISCONNECTED: 'streamr:node-node:node-disconnected',
    RESEND_REQUEST: 'streamr:node-node:resend-request',
    RESEND_RESPONSE: 'streamr:node-node:resend-response',
    UNICAST_RECEIVED: 'streamr:node-node:unicast-received'
})

const eventPerType = {}
eventPerType[ControlLayer.BroadcastMessage.TYPE] = events.DATA_RECEIVED
eventPerType[ControlLayer.UnicastMessage.TYPE] = events.UNICAST_RECEIVED
eventPerType[ControlLayer.SubscribeRequest.TYPE] = events.SUBSCRIBE_REQUEST
eventPerType[ControlLayer.UnsubscribeRequest.TYPE] = events.UNSUBSCRIBE_REQUEST
eventPerType[ControlLayer.ResendLastRequest.TYPE] = events.RESEND_REQUEST
eventPerType[ControlLayer.ResendFromRequest.TYPE] = events.RESEND_REQUEST
eventPerType[ControlLayer.ResendRangeRequest.TYPE] = events.RESEND_REQUEST
eventPerType[ControlLayer.ResendResponseResending.TYPE] = events.RESEND_RESPONSE
eventPerType[ControlLayer.ResendResponseResent.TYPE] = events.RESEND_RESPONSE
eventPerType[ControlLayer.ResendResponseNoResend.TYPE] = events.RESEND_RESPONSE

class NodeToNode extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
        this.endpoint.on(endpointEvents.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, (peerInfo, reason) => this.onPeerDisconnected(peerInfo, reason))
        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
    }

    connectToNode(address) {
        return this.endpoint.connect(address)
    }

    sendData(receiverNodeId, streamMessage) {
        this.endpoint.sendSync(receiverNodeId, encoder.wrapperMessage(ControlLayer.BroadcastMessage.create(streamMessage)))
    }

    sendSubscribe(receiverNodeId, streamIdAndPartition) {
        return this.send(receiverNodeId, ControlLayer.SubscribeRequest.create(streamIdAndPartition.id, streamIdAndPartition.partition))
    }

    sendUnsubscribe(receiverNodeId, streamIdAndPartition) {
        return this.send(receiverNodeId, ControlLayer.UnsubscribeRequest.create(streamIdAndPartition.id, streamIdAndPartition.partition))
    }

    disconnectFromNode(receiverNodeId, reason) {
        this.endpoint.close(receiverNodeId, reason)
    }

    send(receiverNodeId, message) {
        return this.endpoint.send(receiverNodeId, encoder.wrapperMessage(message))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop() {
        return this.endpoint.stop()
    }

    onPeerConnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_CONNECTED, peerInfo.peerId)
        }
    }

    onPeerDisconnected(peerInfo, reason) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_DISCONNECTED, peerInfo.peerId)
        }
    }

    onMessageReceived(peerInfo, rawMessage) {
        const message = encoder.decode(peerInfo.peerId, rawMessage)
        if (message.getCode() === msgTypes.WRAPPER) {
            this.emit(eventPerType[message.controlLayerPayload.type], message.controlLayerPayload, message.getSource())
        }
    }
}

NodeToNode.events = events

module.exports = NodeToNode
