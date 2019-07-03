const { EventEmitter } = require('events')

const encoder = require('../helpers/MessageEncoder')

const EndpointListener = require('./EndpointListener')
const { PeerBook } = require('./PeerBook')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:tracker-node:send-status',
    TRACKER_INSTRUCTION_RECEIVED: 'streamr:tracker-node:tracker-instruction-received',
    TRACKER_DISCONNECTED: 'streamr:tracker-node:tracker-disconnected',
    STORAGE_NODES_RECEIVED: 'streamr:tracker-node:storage-nodes-received'
})

class TrackerNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this.peerBook = new PeerBook()

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    sendStatus(trackerId, status) {
        const trackerAddress = this.peerBook.getAddress(trackerId)
        return this.endpoint.send(trackerAddress, encoder.statusMessage(status))
    }

    findStorageNodes(trackerId, streamId) {
        const trackerAddress = this.peerBook.getAddress(trackerId)
        return this.endpoint.send(trackerAddress, encoder.findStorageNodesMessage(streamId))
    }

    stop(cb) {
        this.endpoint.stop(cb)
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.INSTRUCTION:
                this.emit(events.TRACKER_INSTRUCTION_RECEIVED, message)
                break
            case encoder.STORAGE_NODES:
                this.emit(events.STORAGE_NODES_RECEIVED, message)
                break
            default:
                break
        }
    }

    connectToTracker(trackerAddress) {
        return this.endpoint.connect(trackerAddress)
    }

    onPeerConnected(peerId) {
        if (this.peerBook.isTracker(peerId)) {
            this.emit(events.CONNECTED_TO_TRACKER, peerId)
        }
    }

    onPeerDisconnected(peerId, reason) {
        if (this.peerBook.isTracker(peerId)) {
            this.emit(events.TRACKER_DISCONNECTED, peerId)
        }
    }
}

TrackerNode.events = events

module.exports = TrackerNode
