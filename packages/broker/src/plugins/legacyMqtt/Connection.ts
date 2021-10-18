import events from 'events'
import { Logger } from 'streamr-network'
import { Todo } from '../../types'

const logger = new Logger(module)

export class Connection extends events.EventEmitter {

    id: Todo
    client: Todo
    token: Todo
    streams: Todo
    dead: Todo

    constructor(client: Todo, clientId = '', token = '') {
        super()

        this.id = clientId
        this.client = client
        this.token = token
        this.streams = []
        this.dead = false

        this.client.once('connect', (packet: Todo) => this.emit('connect', packet))
        this.client.once('close', () => this.emit('close'))
        this.client.on('error', (err: Todo) => this.emit('error', err))
        this.client.once('disconnect', () => this.emit('disconnect'))

        this.client.on('publish', (packet: Todo) => this.emit('publish', packet))
        this.client.on('subscribe', (packet: Todo) => this.emit('subscribe', packet))
        this.client.on('unsubscribe', (packet: Todo) => this.emit('unsubscribe', packet))

        this.client.on('pingreq', () => this.client.pingresp())
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

    sendUnsubscribe(packet: Todo): void {
        try {
            if (!this.isDead()) {
                this.client.unsubscribe(packet)
            }
        } catch (e) {
            logger.error(`Failed to unsubscribe: ${e.message}`)
        }
    }

    setClientId(clientId: Todo): this {
        this.id = clientId
        return this
    }

    setToken(token: Todo): this {
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

    addStream(stream: Todo): void {
        this.streams.push(stream)
    }

    removeStream(streamId: string, streamPartition: number): void {
        const i = this.streams.findIndex((s: Todo) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb: Todo): void {
        this.getStreams().forEach(cb)
    }

    getStreams(): any {
        return this.streams.slice() // return copy
    }

    streamsAsString(): any {
        return this.streams.map((s: Todo) => s.toString())
    }
}

