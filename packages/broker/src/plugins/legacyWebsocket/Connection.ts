import { EventEmitter } from 'events'
import { Logger } from 'streamr-network'
import { ControlMessage, ControlLayer } from 'streamr-client-protocol'
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
    on(eventName: 'message', handler: (msg: ControlMessage) => void): this
    on(eventName: 'close', handler: () => void): this
    on(eventName: 'highBackPressure', handler: () => void): this
    on(eventName: 'lowBackPressure', handler: () => void): this
}

export class Connection extends EventEmitter {
    readonly id: string
    readonly controlLayerVersion: number
    readonly messageLayerVersion: number
    private readonly socket: WebSocket
    private readonly duplexStream: stream.Duplex
    private readonly streams: Stream<Connection>[] = []
    private dead = false
    private highBackPressure = false
    private respondedPong = true

    constructor(
        socket: WebSocket,
        duplexStream: stream.Duplex,
        controlLayerVersion: number,
        messageLayerVersion: number
    ) {
        super()
        this.id = generateId()
        this.socket = socket
        this.duplexStream = duplexStream
        this.controlLayerVersion = controlLayerVersion
        this.messageLayerVersion = messageLayerVersion

        duplexStream.on('data', (data: WebSocket.Data) => {
            if (this.dead) {
                return
            }
            let message: ControlMessage | undefined
            try {
                message = ControlMessage.deserialize(data.toString(), false)
            } catch (err) {
                this.send(new ControlLayer.ErrorResponse({
                    requestId: '', // Can't echo the requestId of the request since parsing the request failed
                    errorMessage: err.message || err,
                    errorCode: ControlLayer.ErrorCode.INVALID_REQUEST,
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
            logger.trace('socket "%s" closed connections (was on streams="%o")', this.id, this.getStreamsAsString())
            this.emit('close')
        })
        socket.on('error', (err) => {
            logger.warn('socket "%s" error %s', this.id, err)
        })

        duplexStream.on('drain', () => {
            logger.debug('Back pressure LOW for %s at %d', this.id, this.getBufferedAmount())
            this.emit('lowBackPressure')
            this.highBackPressure = false
        })
        duplexStream.on('error', (err) => { // important to have handler here to avoid thrown error
            logger.warn('socket "%s" error %s', this.id, err)
        })
    }

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    getStreams(): Stream<Connection>[] {
        return this.streams.slice() // return copy
    }

    isDead(): boolean {
        return this.dead
    }

    setRespondedToPongAsFalse(): void {
        this.respondedPong = false
    }

    hasRespondedToPong(): boolean {
        return this.respondedPong
    }

    addStream(stream: Stream<Connection>): void {
        this.streams.push(stream)
    }

    removeStream(streamId: string, streamPartition: number): void {
        const i = this.streams.findIndex((s: Stream<Connection>) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb: (stream: Stream<Connection>) => void): void {
        this.getStreams().forEach(cb)
    }

    getStreamsAsString(): Protocol.SPIDKey[] {
        return this.streams.map((s: Stream<Connection>) => s.getSPIDKey())
    }

    ping(): void {
        this.socket.ping()
        logger.trace(`sent ping to ${this.id}`)
    }

    send(msg: ControlMessage): void {
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

    close(): void {
        try {
            this.socket.close()
        } catch (e) {
            logger.warn('connection %s threw error on graceful close, reason: %s', this.id, e)
        } finally {
            this.dead = true
            this.emit('close')
        }
    }

    forceClose(reason: string): void {
        try {
            this.socket.terminate()
        } catch (e) {
            // no need to check this error
        } finally {
            logger.info('connection %s was terminated, reason: %s', this.id, reason)
            this.dead = true
            this.emit('close')
        }
    }
}
