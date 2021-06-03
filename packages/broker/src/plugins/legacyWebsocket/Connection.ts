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

export interface Connection {
    on(eventName: 'close', handler: () => void): this
    on(eventName: 'highBackPressure', handler: () => void): this
    on(eventName: 'lowBackPressure', handler: () => void): this
}

export class Connection extends EventEmitter {
    static LOW_BACK_PRESSURE = 1024 * 1024
    static HIGH_BACK_PRESSURE = 1024 * 1024 * 4

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

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    getStreams(): Stream[] {
        return this.streams.slice() // return copy
    }

    isDead(): boolean {
        return this.dead
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

    streamsAsString(): string[] {
        return this.streams.map((s: Stream) => s.toString())
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
            this.forceClose(`unable to send message: ${e}`)
        }
    }

    forceClose(reason: string): void {
        try {
            this.socket.terminate()
        } catch (e) {
            // no need to check this error
        } finally {
            logger.warn('connection %s was terminated, reason: %s', this.id, reason)
            this.dead = true
            this.emit('close')
        }
    }
}
