const events = require('events')

const debug = require('debug')('streamr:Connection:mqtt')

module.exports = class Connection extends events.EventEmitter {
    constructor(client, clientId, token, apiKey) {
        super()

        this.id = clientId
        this.client = client
        this.token = token
        this.apiKey = apiKey
        this.streams = []

        this.client.on('close', () => this.emit('close'))
        this.client.on('error', (err) => this.emit('error', err))
        this.client.on('disconnect', () => this.emit('disconnect'))
        this.client.on('publish', (packet) => this.emit('publish', packet))
        this.client.on('subscribe', (packet) => this.emit('subscribe', packet))

        // client pinged
        this.client.on('pingreq', () => this.client.pingresp())
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

