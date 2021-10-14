import { EventEmitter } from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import { Logger } from 'streamr-network'
import mqttCon from "mqtt-connection"
import { Stream } from "../../Stream"
import * as mqtt from "mqtt-packet"

const logger = new Logger(module)

/**
 * Strict types for EventEmitter interface.
 */
interface Events {
    connect: (packet: mqtt.IConnectPacket) => void
    close: () => void
    disconnect: () => void
    publish: (packet: mqtt.IPublishPacket) => void
    subscribe: (packet: mqtt.ISubscribePacket & mqtt.ISubscription) => void
    unsubscribe: (packet: mqtt.IUnsubscribePacket) => void
    error: (err?: any) => void
}

// reminder: only use Connection emitter for external handlers
// to make it safe for consumers to call removeAllListeners
// i.e. no this.on('event')
export const ConnectionEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, Events> }

export class Connection extends ConnectionEmitter {

    id = ''
    client: mqttCon.Connection
    token = ''
    streams: Array<Stream<Connection>> = []
    private dead = false

    constructor(client: mqttCon.Connection) {
        super()

        this.client = client
        this.client.once('connect', (packet) => this.emit('connect', packet))
        this.client.once('close', () => this.emit('close'))
        this.client.once('disconnect', () => this.emit('disconnect'))

        this.client.on('publish', (packet) => this.emit('publish', packet))
        this.client.on('subscribe', (packet) => this.emit('subscribe', packet))
        this.client.on('unsubscribe', (packet) => this.emit('unsubscribe', packet))
        this.client.on('pingreq', () => this.client.pingresp())
        this.client.on('error', (err) => this.emit('error', err))
    }

    markAsDead(): void {
        this.dead = true
    }

    isDead(): any {
        return this.dead
    }

    // Connection refused, server unavailable
    sendConnectionRefusedServerUnavailable(): void {
        this.sendConnack(3)
    }

    // Connection refused, bad user name or password
    sendConnectionRefused(): void {
        this.sendConnack(4)
    }

    // Connection refused, not authorized
    sendConnectionNotAuthorized(): void {
        this.sendConnack(5)
    }

    sendConnectionAccepted(): void {
        this.sendConnack(0)
    }

    private sendConnack(code = 0): void {
        try {
            this.client.connack({
                returnCode: code
            })
        } catch (e) {
            logger.error(`Failed to send connack: ${e.message}`)
        }
    }

    sendUnsubscribe(packet: Partial<mqtt.IUnsubscribePacket>): void {
        try {
            if (!this.isDead()) {
                this.client.unsubscribe(packet)
            }
        } catch (e) {
            logger.error(`Failed to unsubscribe: ${e.message}`)
        }
    }

    setClientId(clientId: string): this {
        this.id = clientId
        return this
    }

    setToken(token: string): this {
        this.token = token
        return this
    }

    close(): void {
        try {
            this.client.destroy()
        } catch (e) {
            logger.error(`Failed to destroy mqtt client: ${e.message}`)
        }

        this.streams = []
    }

    addStream(stream: Stream<Connection>): void {
        this.streams.push(stream)
    }

    removeStream(streamId: string, streamPartition: number): void {
        const i = this.streams.findIndex((s) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb: (stream: Stream<Connection>) => void): void {
        this.getStreams().forEach(cb)
    }

    getStreams(): any {
        return this.streams.slice() // return copy
    }

    streamsAsString(): string[] {
        return this.streams.map((s) => s.toString())
    }
}

