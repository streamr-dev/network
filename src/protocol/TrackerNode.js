const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:tracker-node')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')
const PeerBook = require('./PeerBook')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:peer:send-status',
    STREAM_INFO_RECEIVED: 'streamr:node:found-stream',
    TRACKER_DISCONNECTED: 'streamr:tracker-node:tracker-disconnected'
})

class TrackerNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this.peerBook = new PeerBook()

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    async sendStatus(trackerId, status) {
        const trackerAddress = this.peerBook.getAddress(trackerId)
        await this.endpoint.send(trackerAddress, encoder.statusMessage(status)).catch((err) => {
            console.error(`Could not send status to tracker ${trackerAddress} because '${err}'`)
        })
    }

    requestStreamInfo(trackerId, streamId) {
        const trackerAddress = this.peerBook.getAddress(trackerId)
        this.endpoint.send(trackerAddress, encoder.streamMessage(streamId, ''))
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.STREAM:
                this.emit(events.STREAM_INFO_RECEIVED, message)
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
