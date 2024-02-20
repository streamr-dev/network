import { Logger, binaryToUtf8 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { WebSocket } from 'ws'
import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from '../IConnection'
import { createRandomConnectionId } from '../Connection'

const logger = new Logger(module)

// https://kapeli.com/cheat_sheets/WebSocket_Status_Codes.docset/Contents/Resources/Documents/index
// Browsers send this automatically when closing a tab
export const GOING_AWAY = 1001
// The GOING_AWAY is a reserved code and we shouldn't send that from the application. Therefore
// we have a custom counterpart
export const CUSTOM_GOING_AWAY = 3001

const BINARY_TYPE = 'arraybuffer'

export class WebsocketClientConnection extends EventEmitter<ConnectionEvents> implements IConnection {

    public readonly connectionId: ConnectionID
    private socket?: WebSocket
    public connectionType = ConnectionType.WEBSOCKET_CLIENT

    private destroyed = false

    constructor() {
        super()
        this.connectionId = createRandomConnectionId()
    }

    // TODO explicit default value for "selfSigned" or make it required
    public connect(address: string, selfSigned?: boolean): void {
        if (!this.destroyed) {
            this.socket = new WebSocket(address, { rejectUnauthorized: !selfSigned })
            this.socket.binaryType = BINARY_TYPE
            this.socket.on('error', (error: Error) => {
                if (!this.destroyed) {
                    logger.trace('WebSocket Client error: ' + error?.message, { error })
                    this.emit('error', error.name)
                }
            })

            this.socket.on('open', () => {
                if (!this.destroyed) {
                    logger.trace('WebSocket Client Connected')
                    if (this.socket && this.socket.readyState === this.socket.OPEN) {
                        this.emit('connected')
                    }
                }
            })

            this.socket.on('close', (code: number, reason: Buffer) => {
                if (!this.destroyed) {
                    logger.trace('Websocket Closed')
                    this.doDisconnect(code, binaryToUtf8(reason))
                }
            })

            this.socket.on('message', (message: Buffer, isBinary: boolean) => {
                if (!this.destroyed) {
                    if (isBinary === false) {
                        logger.debug('Received string: \'' + message + '\'')
                    } else {
                        this.emit('data', new Uint8Array(message))
                    }
                }
            })
        } else {
            logger.debug('Tried to connect() a stopped connection')
        }
    }

    private doDisconnect(code?: number, reason?: string) {
        this.destroyed = true
        this.stopListening()
        this.socket = undefined
        const gracefulLeave = (code === GOING_AWAY) || (code === CUSTOM_GOING_AWAY)
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
            logger.trace(`Closing socket for connection ${this.connectionId}`)
            this.socket?.close(gracefulLeave ? CUSTOM_GOING_AWAY : undefined)
        } else {
            logger.debug('Tried to close() a stopped connection')
        }
    }

    private stopListening(): void {
        this.socket?.removeAllListeners()
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
