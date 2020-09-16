const { EventEmitter } = require('events')

const { v4: uuidv4 } = require('uuid')
const { ControlLayer } = require('streamr-client-protocol')

const { decode } = require('../helpers/MessageEncoder')
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
eventPerType[ControlLayer.ControlMessage.TYPES.BroadcastMessage] = events.DATA_RECEIVED
eventPerType[ControlLayer.ControlMessage.TYPES.UnicastMessage] = events.UNICAST_RECEIVED
eventPerType[ControlLayer.ControlMessage.TYPES.SubscribeRequest] = events.SUBSCRIBE_REQUEST
eventPerType[ControlLayer.ControlMessage.TYPES.UnsubscribeRequest] = events.UNSUBSCRIBE_REQUEST
eventPerType[ControlLayer.ControlMessage.TYPES.ResendLastRequest] = events.RESEND_REQUEST
eventPerType[ControlLayer.ControlMessage.TYPES.ResendFromRequest] = events.RESEND_REQUEST
eventPerType[ControlLayer.ControlMessage.TYPES.ResendRangeRequest] = events.RESEND_REQUEST
eventPerType[ControlLayer.ControlMessage.TYPES.ResendResponseResending] = events.RESEND_RESPONSE
eventPerType[ControlLayer.ControlMessage.TYPES.ResendResponseResent] = events.RESEND_RESPONSE
eventPerType[ControlLayer.ControlMessage.TYPES.ResendResponseNoResend] = events.RESEND_RESPONSE

class NodeToNode extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
        endpoint.on(endpointEvents.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        endpoint.on(endpointEvents.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        endpoint.on(endpointEvents.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
    }

    connectToNode(address) {
        return this.endpoint.connect(address)
    }

    sendData(receiverNodeId, streamMessage) {
        this.send(receiverNodeId, new ControlLayer.BroadcastMessage({
            requestId: '', // TODO: how to echo here the requestId of the original SubscribeRequest?
            streamMessage,
        }))
    }

    sendSubscribe(receiverNodeId, streamIdAndPartition) {
        return this.send(receiverNodeId, new ControlLayer.SubscribeRequest({
            requestId: uuidv4(),
            streamId: streamIdAndPartition.id,
            streamPartition: streamIdAndPartition.partition,
        }))
    }

    sendUnsubscribe(receiverNodeId, streamIdAndPartition) {
        return this.send(receiverNodeId, new ControlLayer.UnsubscribeRequest({
            requestId: uuidv4(),
            streamId: streamIdAndPartition.id,
            streamPartition: streamIdAndPartition.partition,
        }))
    }

    disconnectFromNode(receiverNodeId, reason) {
        this.endpoint.close(receiverNodeId, reason)
    }

    send(receiverNodeId, message) {
        return this.endpoint.send(receiverNodeId, message.serialize())
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

    onPeerDisconnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_DISCONNECTED, peerInfo.peerId)
        }
    }

    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isNode()) {
            const message = decode(rawMessage, ControlLayer.ControlMessage.deserialize)
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId)
            } else {
                console.warn(`NodeToNode: invalid message from ${peerInfo}: ${rawMessage}`)
            }
        }
    }

    getRtts() {
        return this.endpoint.getRtts()
    }
}

NodeToNode.events = events

module.exports = NodeToNode
