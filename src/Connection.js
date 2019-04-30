const events = require('events')
const debug = require('debug')('streamr:Connection')
const qs = require('qs')
const { ErrorResponse } = require('streamr-client-protocol').ControlLayer

let nextId = 1

module.exports = class Connection extends events.EventEmitter {
    constructor(socket, request) {
        super()
        this.id = `socketId-${nextId}`
        nextId += 1
        this.socket = socket
        this.streams = []
        const parts = request.url.split('?')
        // default versions for old clients
        this.controlLayerVersion = 0
        this.messageLayerVersion = 28
        if (parts.length === 2) {
            const queryObj = qs.parse(parts[1])
            if (queryObj.controlLayerVersion && queryObj.messageLayerVersion) {
                this.controlLayerVersion = parseInt(queryObj.controlLayerVersion)
                this.messageLayerVersion = parseInt(queryObj.messageLayerVersion)
            }
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
        const serialized = msg.serialize(this.controlLayerVersion, this.messageLayerVersion)
        debug('send: %s: %o', this.id, serialized)
        this.socket.send(serialized)
    }

    sendError(errorMessage) {
        this.send(ErrorResponse.create(errorMessage))
    }
}

