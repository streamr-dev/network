const { EventEmitter } = require('events')
const debug = require('debug')('streamr:tracker-node')
const connectionEvents = require('../connection/Connection').events
const { isTracker, getAddress } = require('../util')
const encoder = require('../helpers/MessageEncoder')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:peer:send-status',
    NODE_LIST_RECEIVED: 'streamr:node-node:connect',
    DATA_RECEIVED: 'streamr:node-node:stream-data',
    STREAM_INFO_RECEIVED: 'streamr:node:found-stream'
})

class TrackerNode extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection

        this.connection.on(connectionEvents.MESSAGE_RECEIVED, ({ sender, message }) => this._onReceive(sender, message))
        this.connection.on(connectionEvents.PEER_DISCOVERED, (tracker) => this._onConnectToTracker(tracker))
    }

    sendStatus(tracker, status) {
        this.connection.send(tracker, encoder.statusMessage(status))
    }

    requestStreamInfo(tracker, streamId) {
        this.connection.send(tracker, encoder.streamMessage(streamId, ''))
    }

    async _onConnectToTracker(tracker) {
        if (isTracker(getAddress(tracker)) && !this.connection.isConnected(tracker)) {
            await this.connection.connect(tracker)

            this.tracker = tracker
            this.emit(events.CONNECTED_TO_TRACKER, tracker)
        }
    }

    _onReceive(sender, message) {
        const { code, data } = encoder.decode(message)

        switch (code) {
            case encoder.PEERS:
                // ask tacker again
                if (!data.length && this.tracker) { // data = peers
                    debug('no available peers, ask again tracker')

                    setTimeout(() => {
                        this.connection.send(this.tracker, encoder.peersMessage([]))
                    }, 10000)
                } else if (data.length) {
                    this.emit(events.NODE_LIST_RECEIVED, data)
                }
                break

            case encoder.DATA:
                this.emit(events.DATA_RECEIVED, {
                    streamId: data[0],
                    data: data[1]
                })
                break

            case encoder.STREAM:
                console.log('found node')
                this.emit(events.STREAM_INFO_RECEIVED, {
                    streamId: data[0],
                    nodeAddress: data[1]
                })
                break

            default:
                throw new Error('Unhandled message type')
        }
    }
}

TrackerNode.events = events

module.exports = TrackerNode
