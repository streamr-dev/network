const EventEmitter = require('events').EventEmitter
const isTracker = require('../util').isTracker
const encoder = require('../helpers/MessageEncoder')
const debug = require('debug')('streamr:tracker-server')

module.exports = class TrackerServer extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection

        this.connection.on('streamr:peer:connect', (peer) => this.onNewConnection(peer))
        this.connection.on('streamr:message-received', ({
            sender,
            message
        }) => this.onReceive(sender, message))
    }

    onNewConnection(peer) {
        if (!isTracker(peer)) {
            this.emit('streamr:tracker:send-peers', peer)
        }
    }

    onReceive(peer, message) {
        const {
            code,
            data
        } = encoder.decode(message)

        switch (code) {
            case encoder.STATUS:
                const status = data
                this.emit('streamr:tracker:peer-status', {
                    peer,
                    status
                })

                break

            case encoder.STREAM:
                this.emit('streamr:tracker:find-stream', {
                    sender: peer,
                    streamId: data[0]
                })
                break

            case encoder.PEERS:
                this.emit('streamr:tracker:send-peers', peer)
                break

            default:
                throw new Error('Unhandled message type')
        }
    }
}
