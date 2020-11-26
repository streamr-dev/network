const { EventEmitter } = require('events')

const { v4: uuidv4 } = require('uuid')
const { ControlLayer } = require('streamr-client-protocol')

const getLogger = require('../helpers/logger')
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
    UNICAST_RECEIVED: 'streamr:node-node:unicast-received',
    LOW_BACK_PRESSURE: 'streamr:node-node:low-back-pressure',
    HIGH_BACK_PRESSURE: 'streamr:node-node:high-back-pressure',
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
        endpoint.on(endpointEvents.LOW_BACK_PRESSURE, (peerInfo) => this.onLowBackPressure(peerInfo))
        endpoint.on(endpointEvents.HIGH_BACK_PRESSURE, (peerInfo) => this.onHighBackPressure(peerInfo))
        this.logger = getLogger(`streamr:NodeToNode:${endpoint.id}`)
    }

    connectToNode(receiverNodeId, trackerAddress, isOffering, trackerInstructed = true) {
        return this.endpoint.connect(receiverNodeId, trackerAddress, isOffering, trackerInstructed)
    }

    sendData(receiverNodeId, streamMessage) {
        return this.send(receiverNodeId, new ControlLayer.BroadcastMessage({
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

    send(receiverNodeId, message) {
        return this.endpoint.send(receiverNodeId, message.serialize()).then(() => message)
    }

    disconnectFromNode(receiverNodeId, reason) {
        this.endpoint.close(receiverNodeId, reason)
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
                this.logger.warn('NodeToNode: invalid message from %s: %s', peerInfo, rawMessage)
            }
        }
    }

    onLowBackPressure(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.LOW_BACK_PRESSURE, peerInfo.peerId)
        }
    }

    onHighBackPressure(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.HIGH_BACK_PRESSURE, peerInfo.peerId)
        }
    }

    getRtts() {
        return this.endpoint.getRtts()
    }
}

NodeToNode.events = events

module.exports = NodeToNode
