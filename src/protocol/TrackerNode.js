const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:tracker-node')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:peer:send-status',
    STREAM_INFO_RECEIVED: 'streamr:node:found-stream',
    STREAM_ASSIGNED: 'streamr:node:stream-assigned',
    TRACKER_DISCONNECTED: 'streamr:tracker-node:tracker-disconnected'
})

class TrackerNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    sendStatus(tracker, status) {
        this.endpoint.send(tracker, encoder.statusMessage(status))
    }

    requestStreamInfo(tracker, streamId) {
        this.endpoint.send(tracker, encoder.streamMessage(streamId, ''))
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.STREAM:
                if (message.getNodeAddresses().includes(this.endpoint.getAddress())) { // TODO: wtf to do there
                    this.emit(events.STREAM_ASSIGNED, message.getStreamId())
                } else {
                    this.emit(events.STREAM_INFO_RECEIVED, message)
                }
                break

            default:
                break
        }
    }

    connectToTracker(tracker) {
        return this.endpoint.connect(tracker)
    }

    async onPeerConnected(peer) {
        // TODO just on peer connected?
        this.emit(events.CONNECTED_TO_TRACKER, peer)
    }

    async onPeerDisconnected(peer) {
        this.emit(events.TRACKER_DISCONNECTED, peer)
    }
}

TrackerNode.events = events

module.exports = TrackerNode
