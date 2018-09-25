const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:tracker-node')
const { isTracker, getAddress } = require('../util')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:peer:send-status',
    NODE_LIST_RECEIVED: 'streamr:node-node:connect',
    STREAM_INFO_RECEIVED: 'streamr:node:found-stream',
    STREAM_ASSIGNED: 'streamr:node:stream-assigned',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected'
})

class TrackerNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)

        this.peersInterval = null
    }

    _clearPeerRequestInterval() {
        clearInterval(this.peersInterval)
        this.peersInterval = null
    }

    sendStatus(tracker, status) {
        this.endpoint.send(tracker, encoder.statusMessage(status))
    }

    requestStreamInfo(tracker, streamId) {
        this.endpoint.send(tracker, encoder.streamMessage(streamId, ''))
    }

    requestMorePeers() {
        if (this.peersInterval === null) {
            this.endpoint.send(this.tracker, encoder.peersMessage([]))
            this.peersInterval = setInterval(() => {
                this.endpoint.send(this.tracker, encoder.peersMessage([]))
            }, 5000)
        }
    }

    stop() {
        this._clearPeerRequestInterval()
    }

    // EndpointListener implementation
    onPeerConnected(peer) {
    }

    onMessageReceived(sender, message) {
        const { code, data } = encoder.decode(message)

        switch (code) {
            case encoder.PEERS:
                // ask tacker again
                if (!data.length && this.tracker && this.endpoint.isConnected(this.tracker)) { // data = peers
                    debug('no available peers, ask again tracker')
                } else if (data.length) {
                    this.emit(events.NODE_LIST_RECEIVED, data)
                    this._clearPeerRequestInterval()
                }
                break

            case encoder.STREAM:
                if (data[1] === getAddress(this.endpoint.node.peerInfo)) {
                    this.emit(events.STREAM_ASSIGNED, data[0])
                } else {
                    this.emit(events.STREAM_INFO_RECEIVED, {
                        streamId: data[0],
                        nodeAddress: data[1]
                    })
                }
                break

            default:
                break
        }
    }

    async onPeerDiscovered(peer) {
        if (isTracker(getAddress(peer)) && !this.endpoint.isConnected(peer)) {
            await this.endpoint.connect(peer).then(() => {
                this.tracker = peer
                this.emit(events.CONNECTED_TO_TRACKER, peer)
            }).catch((err) => {
                if (err) {
                    debug('cannot connect to the tracker: ' + err)
                }
            })
        }
    }

    async onPeerDisconnected(peer) {
    }
}

TrackerNode.events = events

module.exports = TrackerNode
