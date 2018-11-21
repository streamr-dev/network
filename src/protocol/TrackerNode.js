const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:tracker-node')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:peer:send-status',
    NODE_LIST_RECEIVED: 'streamr:node-node:connect',
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

    requestPeers(tracker) {
        this.endpoint.send(tracker, encoder.peersMessage([]))
    }

    requestStreamInfo(tracker, streamId) {
        this.endpoint.send(tracker, encoder.streamMessage(streamId, ''))
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.PEERS:
                // eslint-disable-next-line no-case-declarations
                const peers = message.getPeers()
                // ask tacker again
                if (!peers.length) {
                    debug('no available peers, ask again tracker')
                } else if (peers.length) {
                    this.emit(events.NODE_LIST_RECEIVED, message)
                }
                break

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
