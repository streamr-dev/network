const EventEmitter = require('events').EventEmitter
const {
    isTracker,
    getAddress
} = require('../util')
const encoder = require('../helpers/MessageEncoder')
const debug = require('debug')('streamr:tracker-node')

module.exports = class TrackerNode extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection

        this.connection.on('streamr:peer:discovery', (tracker) => this.connectToTracker(tracker))
        this.connection.on('streamr:message-recieved', ({
            sender,
            message
        }) => this.recieve(sender, message))
    }

    async connectToTracker(tracker) {
        if (isTracker(getAddress(tracker)) && !this.connection.isConnected(tracker)) {
            await this.connection.connect(tracker)

            this.tracker = tracker
            this.emit('streamr:peer:send-status', tracker)
        }
    }

    recieve(sender, message) {
        const {
            code,
            data
        } = encoder.decode(message)

        switch (code) {
            case encoder.PEERS:
                const peers = data

                // ask tacker again
                if (!peers.length && this.tracker) {
                    debug('no available peers, ask again tracker')

                    setTimeout(() => {
                        this.connection.send(this.tracker, encoder.peersMessage([]))
                    }, 10000)
                } else if (peers.length) {
                    this.emit('streamr:node-node:connect', peers)
                }

                break;

            default:
                throw new Error('Unhandled message type')
        }
    }
}
