const debug = require('debug')('streamr:Connection')
const qs = require('qs')
const { ErrorResponse } = require('streamr-client-protocol').ControlLayer

let nextId = 1

function generateId() {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

module.exports = class Connection {
    constructor(socket, request) {
        this.id = generateId()
        this.socket = socket
        this.streams = []

        // default versions for old clients
        this.controlLayerVersion = 0
        this.messageLayerVersion = 28

        // attempt to parse versions from request parameters
        const parts = request.url.split('?')
        if (parts.length === 2) {
            const { controlLayerVersion, messageLayerVersion } = qs.parse(parts[1])
            if (controlLayerVersion && messageLayerVersion) {
                this.controlLayerVersion = parseInt(controlLayerVersion)
                this.messageLayerVersion = parseInt(messageLayerVersion)
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
        return this.streams.map((s) => s.toString())
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

