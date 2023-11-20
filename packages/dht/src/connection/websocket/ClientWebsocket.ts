import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { ICloseEvent, IMessageEvent, w3cwebsocket as Websocket } from 'websocket'
import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from '../IConnection'

const logger = new Logger(module)

// https://kapeli.com/cheat_sheets/WebSocket_Status_Codes.docset/Contents/Resources/Documents/index
// Browsers send this automatically when closing a tab
export const GOING_AWAY = 1001

const BINARY_TYPE = 'arraybuffer'

export class ClientWebsocket extends EventEmitter<ConnectionEvents> implements IConnection {
    public readonly connectionId: ConnectionID
    private socket?: Websocket
    public connectionType = ConnectionType.WEBSOCKET_CLIENT

    private destroyed = false

    constructor() {
        super()
        this.connectionId = new ConnectionID()
    }

    public connect(address: string, selfSigned?: boolean): void {
        if (!this.destroyed) {
            this.socket = new Websocket(address, undefined, undefined, undefined, { rejectUnauthorized: !selfSigned })
            this.socket.binaryType = BINARY_TYPE
            this.socket.onerror = (error: Error) => {
                if (!this.destroyed) {
                    logger.trace('WebSocket Client error: ' + error?.message, { error })
                    this.emit('error', error.name)
                }
            }

            this.socket.onopen = () => {
                if (!this.destroyed) {
                    logger.trace('WebSocket Client Connected')
                    if (this.socket && this.socket.readyState === this.socket.OPEN) {
                        this.emit('connected')
                    }
                }
            }

            this.socket.onclose = (event: ICloseEvent) => {
                if (!this.destroyed) {
                    logger.trace('Websocket Closed')
                    this.doDisconnect(event.code, event.reason)
                }
            }

            this.socket.onmessage = (message: IMessageEvent) => {
                if (!this.destroyed) {
                    if (typeof message.data === 'string') {
                        logger.debug('Received string: \'' + message.data + '\'')
                    } else {
                        this.emit('data', new Uint8Array(message.data))
                    }
                }
            }
        } else {
            logger.debug('Tried to connect() a stopped connection')
        }
    }

    private doDisconnect(code?: number, reason?: string) {
        this.destroyed = true
        this.stopListening()
        this.socket = undefined
        const gracefulLeave = code === GOING_AWAY
        this.emit('disconnected', gracefulLeave, code, reason)
        this.removeAllListeners()
    }

    public send(data: Uint8Array): void {
        if (!this.destroyed) {
            if (this.socket && this.socket.readyState === this.socket.OPEN) {
                logger.trace(`Sending data with size ${data.byteLength}`)
                this.socket?.send(data.buffer)
            } else {
                logger.debug('Tried to send data on a non-open connection')
            }
        } else {
            logger.debug('Tried to send() on stopped connection')
        }
    }

    public async close(gracefulLeave: boolean): Promise<void> {
        this.emit('disconnected', gracefulLeave, undefined, 'close() called')
        this.removeAllListeners()
        if (!this.destroyed) {
            logger.trace(`Closing socket for connection ${this.connectionId.toString()}`)
            this.socket?.close(gracefulLeave === true ? GOING_AWAY : undefined)
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
        logger.trace('destroy() a connection')
        if (!this.destroyed) {
            this.removeAllListeners()
            if (this.socket) {
                this.stopListening()
                this.socket.close()
                this.socket = undefined
            }
            this.destroyed = true
        } else {
            logger.debug('Tried to destroy() a stopped connection')
        }
    }
}
