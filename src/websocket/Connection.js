const { EventEmitter } = require('events')

const logger = require('../helpers/logger')('streamr:WebsocketServer:Connection')

let nextId = 1

function generateId() {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

const LOW_BACK_PRESSURE = 1024 * 1024 * 2 // 2 megabytes
const HIGH_BACK_PRESSURE = 1024 * 1024 * 16 // 16 megabytes

module.exports = class Connection extends EventEmitter {
    constructor(socket, controlLayerVersion, messageLayerVersion) {
        super()
        this.id = generateId()
        this.socket = socket
        this.streams = []
        this.ongoingResends = new Set()
        this.dead = false
        this.controlLayerVersion = controlLayerVersion
        this.messageLayerVersion = messageLayerVersion
        this.highBackPressure = false
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

    evaluateBackPressure() {
        if (!this.highBackPressure && this.socket.getBufferedAmount() > HIGH_BACK_PRESSURE) {
            this.emit('highBackPressure')
            this.highBackPressure = true
        } else if (this.highBackPressure && this.socket.getBufferedAmount() < LOW_BACK_PRESSURE) {
            this.emit('lowBackPressure')
            this.highBackPressure = false
        }
    }

    ping() {
        this.socket.ping()
    }

    send(msg) {
        const serialized = msg.serialize(this.controlLayerVersion, this.messageLayerVersion)
        logger.debug('send: %s: %o', this.id, serialized)
        try {
            this.socket.send(serialized)
            this.evaluateBackPressure()
        } catch (e) {
            this.emit('forceClose', e)
        }
    }
}
