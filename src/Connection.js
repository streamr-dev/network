const events = require('events')
const debug = require('debug')('Connection')
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
        let i
        for (i = 0; i < this.streams.length; i++) {
            if (this.streams[i].id === streamId && this.streams[i].partition === streamPartition) {
                break
            }
        }
        if (i < this.streams.length) {
            this.streams.splice(i, 1)
        }
    }

    getStreams() {
        return this.streams.slice() // return copy
    }

    send(msg) {
        const serialized = msg.serialize(this.protocolVersion, this.payloadVersion)
        debug('send: %s: %o', this.id, serialized)
        this.socket.send(serialized)
    }
}
