const { EventEmitter } = require('events')

const debug = require('debug')('streamr:Connection')
const qs = require('qs')
const { ErrorResponse } = require('streamr-client-protocol').ControlLayer

let nextId = 1

function generateId() {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

module.exports = class Connection extends EventEmitter {
    constructor(socket, socketRequest) {
        super()
        this.id = generateId()
        this.socket = socket
        this.streams = []
        this.ongoingResends = new Set()
        this.dead = false

        // default versions for old clients
        this.controlLayerVersion = 0
        this.messageLayerVersion = 28

        // attempt to parse versions from request parameters
        const parts = socketRequest.getQuery()
        if (parts) {
            const { controlLayerVersion, messageLayerVersion } = qs.parse(parts)
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

    addOngoingResend(resend) {
        this.ongoingResends.add(resend)
    }

    removeOngoingResend(resend) {
        this.ongoingResends.delete(resend)
    }

    getOngoingResends() {
        return new Set(this.ongoingResends)
    }

    markAsDead() {
        this.dead = true
    }

    isDead() {
        return this.dead
    }

    ping() {
        this.socket.ping()
    }

    send(msg) {
        const serialized = msg.serialize(this.controlLayerVersion, this.messageLayerVersion)
        debug('send: %s: %o', this.id, serialized)
        try {
            this.socket.send(serialized)
        } catch (e) {
            this.emit('forceClose', e)
        }
    }

    sendError(errorMessage) {
        this.send(ErrorResponse.create(errorMessage))
    }
}

