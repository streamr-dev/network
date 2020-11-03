const events = require('events')

const logger = require('../helpers/logger')('streamr:MqttServer:Connection')

module.exports = class Connection extends events.EventEmitter {
    constructor(client, clientId = '', token = '', apiKey = '') {
        super()

        this.id = clientId
        this.client = client
        this.token = token
        this.apiKey = apiKey
        this.streams = []
        this.dead = false

        this.client.once('connect', (packet) => this.emit('connect', packet))
        this.client.once('close', () => this.emit('close'))
        this.client.on('error', (err) => this.emit('error', err))
        this.client.once('disconnect', () => this.emit('disconnect'))

        this.client.on('publish', (packet) => this.emit('publish', packet))
        this.client.on('subscribe', (packet) => this.emit('subscribe', packet))
        this.client.on('unsubscribe', (packet) => this.emit('unsubscribe', packet))

        this.client.on('pingreq', () => this.client.pingresp())
    }

    markAsDead() {
        this.dead = true
    }

    isDead() {
        return this.dead
    }

    // Connection refused, server unavailable
    sendConnectionRefusedServerUnavailable() {
        this._sendConnack(3)
    }

    // Connection refused, bad user name or password
    sendConnectionRefused() {
        this._sendConnack(4)
    }

    // Connection refused, not authorized
    sendConnectionNotAuthorized() {
        this._sendConnack(5)
    }

    sendConnectionAccepted() {
        this._sendConnack(0)
    }

    _sendConnack(code = 0) {
        try {
            this.client.connack({
                returnCode: code
            })
        } catch (e) {
            logger.error(`Failed to send connack: ${e.message}`)
        }
    }

    sendUnsubscribe(packet) {
        try {
            if (!this.isDead()) {
                this.client.unsubscribe(packet)
            }
        } catch (e) {
            logger.error(`Failed to unsubscribe: ${e.message}`)
        }
    }

    setClientId(clientId) {
        this.id = clientId
        return this
    }

    setToken(token) {
        this.token = token
        return this
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey
        return this
    }

    close() {
        try {
            this.client.destroy()
        } catch (e) {
            logger.error(`Failed to destroy mqtt client: ${e.message}`)
        }

        this.streams = []
    }

    addStream(stream) {
        this.streams.push(stream)
    }

    removeStream(streamId, streamPartition) {
        const i = this.streams.findIndex((s) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb) {
        this.getStreams().forEach(cb)
    }

    getStreams() {
        return this.streams.slice() // return copy
    }

    streamsAsString() {
        return this.streams.map((s) => s.toString())
    }
}

