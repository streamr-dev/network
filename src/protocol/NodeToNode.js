const { EventEmitter } = require('events')

const { ControlLayer } = require('streamr-client-protocol')

const encoder = require('../helpers/MessageEncoder')
const { msgTypes } = require('../messages/messageTypes')

const EndpointListener = require('./EndpointListener')
const { PeerBook, peerTypes } = require('./PeerBook')

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
        this.peerBook = new PeerBook()

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    connectToNode(address) {
        return this.endpoint.connect(address).then(() => this.peerBook.getPeerId(address))
    }

    sendData(receiverNodeId, streamMessage) {
        return this.send(receiverNodeId, ControlLayer.BroadcastMessage.create(streamMessage))
    }

    sendSubscribe(receiverNodeId, streamIdAndPartition) {
        return this.send(receiverNodeId, ControlLayer.SubscribeRequest.create(streamIdAndPartition.id, streamIdAndPartition.partition))
    }

    sendUnsubscribe(receiverNodeId, streamIdAndPartition) {
        return this.send(receiverNodeId, ControlLayer.UnsubscribeRequest.create(streamIdAndPartition.id, streamIdAndPartition.partition))
    }

    disconnectFromNode(receiverNodeId, reason) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.close(receiverNodeAddress, reason).catch((err) => {
            console.error(`Could not close connection ${receiverNodeAddress} because '${err}'`)
        })
    }

    send(receiverNodeId, message) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.wrapperMessage(message))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop(cb) {
        return this.endpoint.stop(cb)
    }

    onPeerConnected(peerId) {
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_CONNECTED, peerId)
        }
    }

    onPeerDisconnected(peerId, reason) {
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_DISCONNECTED, peerId)
        }
    }

    isStorage() {
        return this.endpoint.customHeaders.headers['streamr-peer-type'] === peerTypes.STORAGE
    }

    onMessageReceived(message) {
        if (message.getCode() === msgTypes.WRAPPER) {
            this.emit(eventPerType[message.controlLayerPayload.type], message.controlLayerPayload, message.getSource())
        }
    }
}

NodeToNode.events = events

module.exports = NodeToNode
