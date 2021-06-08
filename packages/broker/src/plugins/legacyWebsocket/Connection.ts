import { EventEmitter } from 'events'
import { Logger, Protocol } from 'streamr-network'
import { Stream } from '../../Stream'
import WebSocket from "ws"
import stream from "stream"

const logger = new Logger(module)

let nextId = 1

function generateId(): string {
    const id = `socketId-${nextId}`
    nextId += 1
    return id
}

export interface Connection {
    on(eventName: 'message', handler: (msg: Protocol.ControlMessage) => void): this
    on(eventName: 'close', handler: () => void): this
    on(eventName: 'highBackPressure', handler: () => void): this
    on(eventName: 'lowBackPressure', handler: () => void): this
}

export class Connection extends EventEmitter {
    readonly id: string
    readonly socket: WebSocket
    private duplexStream: stream.Duplex
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
        this.duplexStream = WebSocket.createWebSocketStream(socket)
        this.streams = []
        this.dead = false
        this.controlLayerVersion = controlLayerVersion
        this.messageLayerVersion = messageLayerVersion
        this.highBackPressure = false

        socket.on('message', async (data: WebSocket.Data) => {
            if (this.dead) {
                return
            }
            let message: Protocol.ControlMessage | undefined
            try {
                message = Protocol.ControlMessage.deserialize(data.toString(), false)
            } catch (err) {
                this.send(new Protocol.ControlLayer.ErrorResponse({
                    requestId: '', // Can't echo the requestId of the request since parsing the request failed
                    errorMessage: err.message || err,
                    // @ts-expect-error this errorCode does not exist in pre-defined set of error codes
                    errorCode: 'INVALID_REQUEST',
                }))
            }
            if (message !== undefined) {
                this.emit('message', message)
            }
        })
        socket.on('pong', () => {
            logger.trace(`received from ${this.id} "pong" frame`)
            this.respondedPong = true
        })
        socket.on('close', () => {
            logger.trace('socket "%s" closed connections (was on streams="%o")', this.id, this.streamsAsString())
            this.emit('close')
        })
        socket.on('error', (err) => {
            logger.warn('socket "%s" error %s', this.id, err)
        })

        this.duplexStream.on('drain', () => {
            logger.debug('Back pressure LOW for %s at %d', this.id, this.getBufferedAmount())
            this.emit('lowBackPressure')
            this.highBackPressure = false
        })
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

    ping(): void {
        this.socket.ping()
        logger.trace(`sent ping to ${this.id}`)
    }

    send(msg: Protocol.ControlLayer.ControlMessage): void {
        const serialized = msg.serialize(this.controlLayerVersion, this.messageLayerVersion)
        logger.trace('send: %s: %o', this.id, serialized)
        let shouldContinueWriting = true
        try {
            shouldContinueWriting = this.duplexStream.write(serialized)
        } catch (e) {
            this.forceClose(`unable to send message: ${e}`)
        }
        if (!shouldContinueWriting) {
            logger.debug('Back pressure HIGH for %s at %d', this.id, this.getBufferedAmount())
            this.emit('highBackPressure')
            this.highBackPressure = true
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
