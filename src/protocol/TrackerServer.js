const { EventEmitter } = require('events')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')
const PeerBook = require('./PeerBook')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    STREAM_INFO_REQUESTED: 'streamr:tracker:find-stream',
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

    sendStreamInfo(receiverNodeId, streamId, listOfNodeIds) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.peerBook.getAddress(nodeId))
        this.endpoint.send(receiverNodeAddress, encoder.streamMessage(streamId, listOfNodeAddresses))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop(cb) {
        this.endpoint.stop(cb)
    }

    onPeerConnected(peerId) {
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_CONNECTED, peerId)
        }
    }

    onPeerDisconnected(peerId) {
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_DISCONNECTED, peerId)
        }
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, message)
                break

            case encoder.STREAM:
                this.emit(events.STREAM_INFO_REQUESTED, message)
                break
            default:
                break
        }
    }
}

TrackerServer.events = events

module.exports = TrackerServer
