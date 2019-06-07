const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:node-node')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { StreamID } = require('../identifiers')
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
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const broadcastMessage = ControlLayer.BroadcastMessage.create(streamMessage)
        return this.endpoint.send(receiverNodeAddress, broadcastMessage.serialize())
    }

    sendUnicast(receiverNodeId, unicastMessage) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, unicastMessage.serialize())
    }

    sendSubscribe(receiverNodeId, streamId, leechOnly) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.subscribeMessage(streamId, leechOnly))
    }

    sendUnsubscribe(receiverNodeId, streamIdAndPartition) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const message = ControlLayer.UnsubscribeRequest.create(streamIdAndPartition.id, streamIdAndPartition.partition)
        this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    requestResendLast(receiverNodeId, message) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    requestResendFrom(receiverNodeId, message) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    requestResendRange(receiverNodeId, message) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    respondResending(receiverNodeId, streamId, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const message = ControlLayer.ResendResponseResending.create(streamId.id, streamId.partition, subId)
        return this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    respondResent(receiverNodeId, streamId, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const message = ControlLayer.ResendResponseResent.create(streamId.id, streamId.partition, subId)
        return this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    respondNoResend(receiverNodeId, streamId, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const message = ControlLayer.ResendResponseNoResend.create(streamId.id, streamId.partition, subId)
        return this.endpoint.send(receiverNodeAddress, message.serialize())
    }

    disconnectFromNode(receiverNodeId, reason) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.close(receiverNodeAddress, reason).catch((err) => {
            console.error(`Could not close connection ${receiverNodeAddress} because '${err}'`)
        })
    }

    send(receiverNodeId, message) { // TODO: better way?
        if (message.type === ControlLayer.ResendLastRequest.TYPE) {
            return this.requestResendLast(receiverNodeId, message)
        }
        if (message.type === ControlLayer.ResendFromRequest.TYPE) {
            return this.requestResendFrom(receiverNodeId, message)
        }
        if (message.type === ControlLayer.ResendRangeRequest.TYPE) {
            return this.requestResendRange(receiverNodeId, message)
        }
        if (message.type === ControlLayer.ResendResponseResending.TYPE) {
            return this.respondResending(receiverNodeId, new StreamID(message.streamId, message.streamPartition), message.subId)
        }
        if (message.type === ControlLayer.ResendResponseNoResend.TYPE) {
            return this.respondNoResend(receiverNodeId, new StreamID(message.streamId, message.streamPartition), message.subId)
        }
        if (message.type === ControlLayer.ResendResponseResent.TYPE) {
            return this.respondResent(receiverNodeId, new StreamID(message.streamId, message.streamPartition), message.subId)
        }
        if (message instanceof ControlLayer.UnicastMessage) {
            return this.sendUnicast(receiverNodeId, message)
        }
        throw new Error(`unrecognized message ${message}`)
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
