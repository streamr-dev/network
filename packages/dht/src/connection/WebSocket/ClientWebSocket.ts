import { IConnection, ConnectionID, ConnectionType, ConnectionEvents } from '../IConnection'
import { w3cwebsocket as WebSocket, ICloseEvent, IMessageEvent } from 'websocket'
import EventEmitter from 'eventemitter3'
import { Logger } from '@streamr/utils'
import { DisconnectionType } from '../../transport/ITransport'

const logger = new Logger(module)

const BINARY_TYPE = 'arraybuffer'

export class ClientWebSocket extends EventEmitter<ConnectionEvents> implements IConnection {
    public readonly connectionId: ConnectionID
    private socket?: WebSocket
    public connectionType = ConnectionType.WEBSOCKET_CLIENT

    private stopped = false

    constructor() {
        super()
        this.connectionId = new ConnectionID()
    }

    public connect(address: string): void {
        if (!this.stopped) {
            this.socket = new WebSocket(address)
            this.socket.binaryType = BINARY_TYPE

            this.socket.onerror = (error: Error) => {
                if (!this.stopped) {
                    logger.trace('WebSocket Client error: ' + error)
                    this.emit('error', error.name)
                }
            }

            this.socket.onopen = () => {
                if (!this.stopped) {
                    logger.trace('WebSocket Client Connected')
                    if (this.socket && this.socket.readyState === this.socket.OPEN) {
                        this.emit('connected')
                    }
                }
            }

            this.socket.onclose = (event: ICloseEvent) => {
                if (!this.stopped) {
                    logger.trace('Websocket Closed')
                    this.doDisconnect('OTHER', event.code, event.reason)
                }
            }

            this.socket.onmessage = (message: IMessageEvent) => {
                if (!this.stopped) {
                    if (typeof message.data === 'string') {
                        logger.debug("Received string: '" + message.data + "'")
                    } else {
                        this.emit('data', new Uint8Array(message.data))
                    }
                }
            }
        } else {
            logger.debug('Tried to connect() a stopped connection')
        }
    }

    private doDisconnect(disconnectionType: DisconnectionType, code?: number, reason?: string) {
        this.stopped = true
        this.stopListening()
        this.socket = undefined

        this.emit('disconnected', disconnectionType, code, reason)
        this.removeAllListeners()
    }

    public send(data: Uint8Array): void {
        if (!this.stopped) {
            if (this.socket && this.socket.readyState === this.socket.OPEN) {
                logger.trace(`Sending data with size ${data.byteLength}`)
                this.socket?.send(data.buffer)
            } else {
                logger.warn('Tried to send data on a non-open connection')
            }
        } else {
            logger.debug('Tried to send() on stopped connection')
        }
    }

    public async close(): Promise<void> {
        if (!this.stopped) {
            logger.trace(`Closing socket for connection ${this.connectionId.toString()}`)
            this.socket?.close()
        } else {
            logger.debug('Tried to close() a stopped connection')
        }
    }

    private stopListening(): void {
        if (this.socket) {
            this.socket.onopen = undefined as unknown as (() => void)
            this.socket.onclose = undefined as unknown as (() => void)
            this.socket.onerror = undefined as unknown as (() => void)
            this.socket.onmessage = undefined as unknown as (() => void)
        }
    }

    public destroy(): void {
        if (!this.stopped) {
            this.removeAllListeners()
            if (this.socket) {
                this.stopListening()
                this.socket.close()
                this.socket = undefined
            }
            this.stopped = true
        } else {
            logger.debug('Tried to destroy() a stopped connection')
        }
    }
}
