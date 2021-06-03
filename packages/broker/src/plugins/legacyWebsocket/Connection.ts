import { EventEmitter } from 'events'
import { Logger, Protocol } from 'streamr-network'
import { Stream } from '../../Stream'
import WebSocket from "ws"

const logger = new Logger(module)

let nextId = 1

function generateId(): string {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

export class Connection extends EventEmitter {
    static LOW_BACK_PRESSURE = 1024 * 1024
    static HIGH_BACK_PRESSURE = 1024 * 1024 * 2

    readonly id: string
    readonly socket: WebSocket
    readonly streams: Stream[] = []
    readonly controlLayerVersion: number
    readonly messageLayerVersion: number
    dead: boolean
    highBackPressure: boolean
    respondedPong = true

    constructor(socket: WebSocket, controlLayerVersion: number, messageLayerVersion: number) {
        super()
        this.id = generateId()
        this.socket = socket
        this.streams = []
        this.dead = false
        this.controlLayerVersion = controlLayerVersion
        this.messageLayerVersion = messageLayerVersion
        this.highBackPressure = false
    }

    addStream(stream: Stream): void {
        this.streams.push(stream)
    }

    removeStream(streamId: string, streamPartition: number): void {
        const i = this.streams.findIndex((s: Stream) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb: (stream: Stream) => void): void {
        this.getStreams().forEach(cb)
    }

    getStreams(): Stream[] {
        return this.streams.slice() // return copy
    }

    streamsAsString(): string[] {
        return this.streams.map((s: Stream) => s.toString())
    }

    markAsDead(): void {
        this.dead = true
    }

    isDead(): boolean {
        return this.dead
    }

    evaluateBackPressure(): void {
        if (!this.highBackPressure && this.getBufferedAmount() > Connection.HIGH_BACK_PRESSURE) {
            logger.debug('Back pressure HIGH for %s at %d', this.id, this.getBufferedAmount())
            this.emit('highBackPressure')
            this.highBackPressure = true
        } else if (this.highBackPressure && this.getBufferedAmount() < Connection.LOW_BACK_PRESSURE) {
            logger.debug('Back pressure LOW for %s at %d', this.id, this.getBufferedAmount())
            this.emit('lowBackPressure')
            this.highBackPressure = false
        }
    }

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    ping(): void {
        this.socket.ping()
    }

    send(msg: Protocol.ControlLayer.ControlMessage): void {
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
