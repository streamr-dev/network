const debug = require('debug')('streamr:Connection:mqtt')
const qs = require('qs')
const { ErrorResponse } = require('streamr-client-protocol').ControlLayer

let nextId = 1

function generateId() {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

module.exports = class Connection {
    constructor(client, clientId) {
        this.id = clientId
        this.client = client
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

    send(msg) {
        const serialized = msg.serialize(this.controlLayerVersion, this.messageLayerVersion)
        debug('send: %s: %o', this.id, serialized)
        this.socket.send(serialized)
    }

    sendError(errorMessage) {
        this.send(ErrorResponse.create(errorMessage))
    }
}

