const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:node-node')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')
const PeerBook = require('./PeerBook')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:node-node:node-connected',
    SUBSCRIBE_REQUEST: 'streamr:node-node:subscribe-request',
    UNSUBSCRIBE_REQUEST: 'streamr:node-node:unsubscribe-request',
    DATA_RECEIVED: 'streamr:node-node:stream-data',
    NODE_DISCONNECTED: 'streamr:node-node:node-disconnected'
})

class NodeToNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this.peerBook = new PeerBook()

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    connectToNodes(nodeAddresses) {
        const promises = []
        nodeAddresses.forEach((address) => {
            promises.push(this.connectToNode(address))
        })
        debug('connecting to %d nodes', promises.length)
        return Promise.all(promises)
    }

    connectToNode(address) {
        return this.endpoint.connect(address).then(() => this.peerBook.getPeerId(address))
    }

    sendData(receiverNodeId, streamId, payload, number, previousNumber) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        this.endpoint.send(receiverNodeAddress, encoder.dataMessage(streamId, payload, number, previousNumber))
    }

    sendSubscribe(receiverNodeId, streamId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        this.endpoint.send(receiverNodeAddress, encoder.subscribeMessage(streamId))
    }

    sendUnsubscribe(receiverNodeId, streamId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        this.endpoint.send(receiverNodeAddress, encoder.unsubscribeMessage(streamId))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop(cb) {
        this.endpoint.stop(cb)
    }

    onPeerConnected(peerId) {
        this.emit(events.NODE_CONNECTED, peerId)
    }

    onPeerDisconnected(peerId) {
        this.emit(events.NODE_DISCONNECTED, peerId)
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.SUBSCRIBE:
                this.emit(events.SUBSCRIBE_REQUEST, message)
                break

            case encoder.UNSUBSCRIBE:
                this.emit(events.UNSUBSCRIBE_REQUEST, message)
                break

            case encoder.DATA:
                this.emit(events.DATA_RECEIVED, message)
                break

            default:
                break
        }
    }
}

NodeToNode.events = events

module.exports = NodeToNode
