import EventEmitter from 'eventemitter3'
import { createRandomConnectionId } from '../Connection'
import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from '../IConnection'
import { Logger } from '@streamr/utils'

export interface Socket {
    binaryType: string
    readyState: number
    close(code?: number, reason?: string): void
    send(data: string | Buffer | ArrayBuffer | ArrayBufferView): void
}

// https://kapeli.com/cheat_sheets/WebSocket_Status_Codes.docset/Contents/Resources/Documents/index
// Browsers send this automatically when closing a tab
export const GOING_AWAY = 1001
// The GOING_AWAY is a reserved code and we shouldn't send that from the application. Therefore
// we have a custom counterpart
export const CUSTOM_GOING_AWAY = 3001
// https://github.com/websockets/ws/blob/master/doc/ws.md#ready-state-constants
const OPEN = 1

const logger = new Logger(module)

export abstract class AbstractWebsocketClientConnection extends EventEmitter<ConnectionEvents> implements IConnection {
    public readonly connectionId: ConnectionID
    protected abstract socket?: Socket
    public connectionType = ConnectionType.WEBSOCKET_CLIENT
    protected destroyed = false

    constructor() {
        super()
        this.connectionId = createRandomConnectionId()
    }

    // TODO explicit default value for "selfSigned" or make it required
    public abstract connect(address: string, allowSelfSignedCertificate: boolean): void

    protected abstract stopListening(): void

    public send(data: Uint8Array): void {
        if (!this.destroyed) {
            if (this.socket && this.socket.readyState === OPEN) {
                logger.trace(`Sending data with size ${data.byteLength}`)
                this.socket?.send(data)
            } else {
                // Could this throw for faster feedback on RPC calls?
                // Currently this log line is seen if a connection is closing but the disconnected event has not been emitted yet.
                logger.debug('Tried to send data on a non-open connection', {
                    id: this.connectionId,
                    readyState: this.socket!.readyState,
                    destroyed: this.destroyed
                })
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
            logger.debug('Tried to close() a stopped connection', { id: this.connectionId })
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

    protected onOpen(): void {
        if (!this.destroyed) {
            logger.trace('WebSocket Client Connected')
            if (this.socket && this.socket.readyState === OPEN) {
                this.emit('connected')
            }
        }
    }

    protected onMessage(message: Uint8Array): void {
        this.emit('data', message)
    }

    protected onClose(code: number, reason: string): void {
        if (!this.destroyed) {
            logger.trace('Websocket Closed')
            this.doDisconnect(code, reason)
        }
    }

    protected onError(error: Error): void {
        if (!this.destroyed) {
            logger.trace('WebSocket Client error: ' + error?.message, { error })
            this.emit('error', error.name)
        }
    }

    protected doDisconnect(code?: number, reason?: string): void {
        this.destroyed = true
        this.stopListening()
        this.socket = undefined
        const gracefulLeave = code === GOING_AWAY || code === CUSTOM_GOING_AWAY
        this.emit('disconnected', gracefulLeave, code, reason)
        this.removeAllListeners()
    }
}
