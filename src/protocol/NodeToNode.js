const { EventEmitter } = require('events')
const { ControlLayer } = require('streamr-client-protocol')
const encoder = require('../helpers/MessageEncoder')
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

    sendSubscribe(receiverNodeId, streamId, leechOnly) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.subscribeMessage(streamId, leechOnly))
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
        return this.endpoint.send(receiverNodeAddress, message.serialize())
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

    onMessageReceived(message, source) {
        if (message.type === ControlLayer.BroadcastMessage.TYPE) {
            this.emit(events.DATA_RECEIVED, message.streamMessage, source)
            return
        }
        if (message.type === ControlLayer.UnicastMessage.TYPE) {
            this.emit(events.UNICAST_RECEIVED, message, source)
            return
        }
        if (message.type === ControlLayer.UnsubscribeRequest.TYPE) {
            this.emit(events.UNSUBSCRIBE_REQUEST, message, source)
            return
        }
        if (message.type === ControlLayer.ResendLastRequest.TYPE
            || message.type === ControlLayer.ResendFromRequest.TYPE
            || message.type === ControlLayer.ResendRangeRequest.TYPE) {
            this.emit(events.RESEND_REQUEST, message, source)
            return
        }
        if (message.type === ControlLayer.ResendResponseNoResend.TYPE
            || message.type === ControlLayer.ResendResponseResending.TYPE
            || message.type === ControlLayer.ResendResponseResent.TYPE) {
            this.emit(events.RESEND_RESPONSE, message, source)
            return
        }
        switch (message.getCode()) {
            case encoder.SUBSCRIBE:
                this.emit(events.SUBSCRIBE_REQUEST, message)
                break

            default:
                break
        }
    }
}

NodeToNode.events = events

module.exports = NodeToNode
