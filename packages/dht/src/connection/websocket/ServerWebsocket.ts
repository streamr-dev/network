import EventEmitter from 'eventemitter3'
import { IConnection, ConnectionID, ConnectionEvents, ConnectionType } from '../IConnection'
import WebSocket from 'ws'
import { Logger } from '@streamr/utils'
import { Url } from 'url'
import { CUSTOM_GOING_AWAY, GOING_AWAY } from './ClientWebsocket'
import { createRandomConnectionId } from '../Connection'

const logger = new Logger(module)

// NodeJsBuffer is global defined in preload.js of Karma
// It is used to make Karma/Electron tests to use the NodeJS
// implementation of Buffer instead of the browser polyfill

declare let NodeJsBuffer: BufferConstructor

export class ServerWebsocket extends EventEmitter<ConnectionEvents> implements IConnection {

    public readonly connectionId: ConnectionID
    public readonly connectionType = ConnectionType.WEBSOCKET_SERVER
    public readonly resourceURL: Url
    public readonly remoteAddress: string
    private socket?: WebSocket
    private stopped = false

    constructor(socket: WebSocket, resourceURL: Url, remoteAddress: string) {
        super()

        this.onMessage = this.onMessage.bind(this)
        this.onClose = this.onClose.bind(this)
        this.onError = this.onError.bind(this)

        this.resourceURL = resourceURL
        this.connectionId = createRandomConnectionId()
        this.remoteAddress = remoteAddress

        socket.on('message', this.onMessage)
        socket.on('close', this.onClose)
        socket.on('error', this.onError)

        this.socket = socket
    }

    private onMessage(message: WebSocket.RawData, isBinary: boolean): void {
        logger.trace('ServerWebsocket::onMessage')
        if (!isBinary) {
            logger.debug('Received string Message')
        } else if (message instanceof Buffer) {
            this.emit('data', new Uint8Array(message))
        }
    }

    private onClose(reasonCode: number, description: string): void {
        // logger.trace('Peer ' + this.socket?.remoteAddress + ' disconnected.')
        this.doDisconnect(reasonCode, description)
    }

    private onError(error: Error): void {
        this.emit('error', error.name)
    }

    private stopListening(): void {
        this.socket?.off('message', this.onMessage)
        this.socket?.off('close', this.onClose)
        this.socket?.off('error', this.onError)
    }

    private doDisconnect(reasonCode: number, description: string): void {
        this.stopped = true
        this.stopListening()
        this.socket = undefined
        const gracefulLeave = (reasonCode === GOING_AWAY) || (reasonCode === CUSTOM_GOING_AWAY)
        this.emit('disconnected', gracefulLeave, reasonCode, description)
    }

    public send(data: Uint8Array): void {
        // If in an Karma / Electron test, use the NodeJS implementation
        // of Buffer instead of the browser polyfill

        // TODO: no need to check this.socket as it is always defined when stopped is false?
        if (!this.stopped && this.socket) {
            if (typeof NodeJsBuffer !== 'undefined') {
                this.socket.send(NodeJsBuffer.from(data), { binary: true })
            } else {
                this.socket.send(Buffer.from(data), { binary: true })
            }
        } else {
            logger.debug('Tried to call send() on a stopped socket')
        }

    }

    public async close(gracefulLeave: boolean): Promise<void> {
        this.emit('disconnected', gracefulLeave, undefined, 'close() called')
        this.removeAllListeners()
        if (!this.stopped) {
            this.socket?.close(gracefulLeave ? GOING_AWAY : undefined)
        } else {
            logger.debug('Tried to close a stopped connection')
        }
    }

    // TODO could rename to "closeSilently?"
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

    public getRemoteIp(): string {
        // TODO: no need to check this.socket as it is always defined when stopped is false?
        // if (!this.stopped && this.socket) {
        //     return this.socket.socket.remoteAddress!
        // } else {
        //     // TODO throw
        //     logger.error('Tried to get the remoteAddress of a stopped connection')
        //     return ''
        // }
        return ''
    }
}
