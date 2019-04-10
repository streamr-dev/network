const { EventEmitter } = require('events')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')
const { PeerBook } = require('./PeerBook')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected'
})

class TrackerServer extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this.peerBook = new PeerBook()

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    sendInstruction(receiverNodeId, streamId, listOfNodeIds) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.peerBook.getAddress(nodeId))
        return this.endpoint.send(receiverNodeAddress, encoder.instructionMessage(streamId, listOfNodeAddresses))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop(cb) {
        this.endpoint.stop(cb)
    }

    onPeerConnected(peerId) {
        const nodeType = this.peerBook.getTypeById(peerId)
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_CONNECTED, {
                peerId, nodeType
            })
        }
    }

    onPeerDisconnected(peerId, reason) {
        const nodeType = this.peerBook.getTypeById(peerId)

        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_DISCONNECTED, {
                peerId, nodeType
            })
        }
    }

    onMessageReceived(message) {
        const nodeType = this.peerBook.getTypeById(message.getSource())
        switch (message.getCode()) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, {
                    statusMessage: message, nodeType
                })
                break
            default:
                break
        }
    }
}

TrackerServer.events = events

module.exports = TrackerServer
