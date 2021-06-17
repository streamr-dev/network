import { EventEmitter } from 'events'
import { Logger, Protocol } from 'streamr-network'
import uWS from 'uWebSockets.js'
import { Stream } from '../../Stream'

const logger = new Logger(module)

let nextId = 1

function generateId() {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

export class Connection extends EventEmitter {

    static LOW_BACK_PRESSURE = 1024 * 1024 // 1 megabytes
    static HIGH_BACK_PRESSURE = 1024 * 1024 * 2 // 2 megabytes

    id: string
    socket: uWS.WebSocket
    streams: Stream[] = []
    dead: boolean
    controlLayerVersion: number
    messageLayerVersion: number
    highBackPressure: boolean

    constructor(socket: uWS.WebSocket, controlLayerVersion: number, messageLayerVersion: number) {
        super()
        this.id = generateId()
        this.socket = socket
        this.streams = []
        this.dead = false
        this.controlLayerVersion = controlLayerVersion
        this.messageLayerVersion = messageLayerVersion
        this.highBackPressure = false
    }

    addStream(stream: Stream) {
        this.streams.push(stream)
    }

    removeStream(streamId: string, streamPartition: number) {
        const i = this.streams.findIndex((s: Stream) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb: (stream: Stream) => void) {
        this.getStreams().forEach(cb)
    }

    getStreams() {
        return this.streams.slice() // return copy
    }

    streamsAsString() {
        return this.streams.map((s: Stream) => s.toString())
    }

    markAsDead() {
        this.dead = true
    }

    isDead() {
        return this.dead
    }

    evaluateBackPressure() {
        if (!this.highBackPressure && this.socket.getBufferedAmount() > Connection.HIGH_BACK_PRESSURE) {
            logger.debug('Back pressure HIGH for %s at %d', this.id, this.socket.getBufferedAmount())
            this.emit('highBackPressure')
            this.highBackPressure = true
        } else if (this.highBackPressure && this.socket.getBufferedAmount() < Connection.LOW_BACK_PRESSURE) {
            logger.debug('Back pressure LOW for %s at %d', this.id, this.socket.getBufferedAmount())
            this.emit('lowBackPressure')
            this.highBackPressure = false
        }
    }

    ping() {
        this.socket.ping()
    }

    send(msg: Protocol.ControlLayer.ControlMessage) {
        const serialized = msg.serialize(this.controlLayerVersion, this.messageLayerVersion)
        logger.trace('send: %s: %o', this.id, serialized)
        try {
            this.socket.send(serialized)
            this.evaluateBackPressure()
        } catch (e) {
            this.emit('forceClose', e)
        }
    }
}