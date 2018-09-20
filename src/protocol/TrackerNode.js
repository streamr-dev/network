const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:tracker-node')
const endpointEvents = require('../connection/Libp2pEndpoint').events
const { isTracker, getAddress } = require('../util')
const encoder = require('../helpers/MessageEncoder')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:peer:send-status',
    NODE_LIST_RECEIVED: 'streamr:node-node:connect',
    DATA_RECEIVED: 'streamr:node-node:stream-data',
    STREAM_INFO_RECEIVED: 'streamr:node:found-stream',
    STREAM_ASSIGNED: 'streamr:node:stream-assigned'
})

class TrackerNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint

        this.peersInterval = null

        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, ({ sender, message }) => this._onReceive(sender, message))
        this.endpoint.on(endpointEvents.PEER_DISCOVERED, (tracker) => this._onConnectToTracker(tracker))
    }

    sendStatus(tracker, status) {
        this.endpoint.send(tracker, encoder.statusMessage(status))
    }

    requestStreamInfo(tracker, streamId) {
        this.endpoint.send(tracker, encoder.streamMessage(streamId, ''))
    }

    async _onConnectToTracker(tracker) {
        if (isTracker(getAddress(tracker)) && !this.endpoint.isConnected(tracker)) {
            await this.endpoint.connect(tracker).then(() => {
                this.tracker = tracker
                this.emit(events.CONNECTED_TO_TRACKER, tracker)
            }).catch((err) => {
                if (err) {
                    debug('cannot connect to the tracker: ' + err)
                }
            })
        }
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

    _onReceive(sender, message) {
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

            case encoder.DATA:
                this.emit(events.DATA_RECEIVED, {
                    streamId: data[0],
                    data: data[1]
                })
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
                throw new Error('Unhandled message type')
        }
    }

    _clearPeerRequestInterval() {
        clearInterval(this.peersInterval)
        this.peersInterval = null
    }
}

TrackerNode.events = events

module.exports = TrackerNode
