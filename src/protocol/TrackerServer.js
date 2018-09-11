const { EventEmitter } = require('events')
const debug = require('debug')('streamr:tracker-server')
const { isTracker } = require('../util')
const encoder = require('../helpers/MessageEncoder')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    STREAM_INFO_REQUESTED: 'streamr:tracker:find-stream',
    NODE_LIST_REQUESTED: 'streamr:tracker:send-peers'
})

module.exports = class TrackerServer extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection

        this.connection.on('streamr:peer:connect', (peer) => this.onNewConnection(peer))
        this.connection.on('streamr:message-received', ({ sender, message }) => this.onReceive(sender, message))
    }

    onNewConnection(peer) {
        if (!isTracker(peer)) {
            this.emit(events.NODE_CONNECTED, peer)
        }
    }

    onReceive(peer, message) {
        const { code, data } = encoder.decode(message)

        switch (code) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, {
                    peer,
                    status: data
                })
                break

            case encoder.STREAM:
                this.emit(events.STREAM_INFO_REQUESTED, {
                    sender: peer,
                    streamId: data[0]
                })
                break

            case encoder.PEERS:
                this.emit(events.NODE_LIST_REQUESTED, peer)
                break

            default:
                throw new Error('Unhandled message type')
        }
    }
}
