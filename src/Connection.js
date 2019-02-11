const events = require('events')
const debug = require('debug')('streamr:Connection')
const qs = require('qs')

module.exports = class Connection extends events.EventEmitter {
    constructor(socket) {
        super()
        this.id = socket.id
        this.socket = socket
        this.streams = []
        const parts = socket.upgradeReq.url.split('?')
        if (parts.length === 2) {
            const queryObj = qs.parse(parts[1])
            this.protocolVersion = queryObj.protocolVersion ? parseInt(queryObj.protocolVersion) : undefined
            this.payloadVersion = queryObj.payloadVersion ? parseInt(queryObj.payloadVersion) : undefined
        }
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
        return this.streams.map((s) => `${s.id}:${s.partition}`)
    }

    send(msg) {
        const serialized = msg.serialize(this.protocolVersion, this.payloadVersion)
        debug('send: %s: %o', this.id, serialized)
        this.socket.send(serialized)
    }
}

