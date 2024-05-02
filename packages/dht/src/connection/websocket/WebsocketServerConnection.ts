import EventEmitter from 'eventemitter3'
import { IConnection, ConnectionID, ConnectionEvents, ConnectionType } from '../IConnection'
import { WebSocket } from 'node-datachannel'
import { Logger } from '@streamr/utils'
import { Url } from 'url'
import { CUSTOM_GOING_AWAY, GOING_AWAY } from './AbstractWebsocketClientConnection'
import { createRandomConnectionId } from '../Connection'

const logger = new Logger(module)

export class WebsocketServerConnection extends EventEmitter<ConnectionEvents> implements IConnection {

    public readonly connectionId: ConnectionID
    public readonly connectionType = ConnectionType.WEBSOCKET_SERVER
    public readonly resourceURL: Url
    public readonly remoteIpAddress: string
    private socket?: WebSocket
    private stopped = false

    constructor(socket: WebSocket, resourceURL: Url, remoteAddress: string) {
        super()

        this.onMessage = this.onMessage.bind(this)
        this.onClose = this.onClose.bind(this)
        this.onError = this.onError.bind(this)

        this.resourceURL = resourceURL
        this.connectionId = createRandomConnectionId()
        this.remoteIpAddress = remoteAddress

        socket.onMessage(this.onMessage)
        socket.onClosed(this.onClose)
        socket.onError(this.onError)

        this.socket = socket
    }

    private onMessage(message: Buffer | string): void {
        if (typeof message === 'string') {
            logger.trace('Received string Message')
        } else {
            logger.trace('Websocket server received Message')
            this.emit('data', new Uint8Array(message))
        }
    }

    private onClose(): void {
        logger.trace('Peer ' + this.remoteIpAddress + ' disconnected.')
        this.socket?.forceClose()
        
        this.doDisconnect(0, '')    // TODO: use proper reason code and description
       
    }

    private onError(error: string): void {
        this.emit('error', error)
    }

    // eslint-disable-next-line class-methods-use-this
    private stopListening(): void {
        /*
        this.socket?.off('message', this.onMessage)
        this.socket?.off('close', this.onClose)
        this.socket?.off('error', this.onError)
        */
    }

    private doDisconnect(reasonCode: number, description: string): void {
        this.stopped = true
        this.stopListening()
        this.socket = undefined
        const gracefulLeave = (reasonCode === GOING_AWAY) || (reasonCode === CUSTOM_GOING_AWAY)
        this.emit('disconnected', gracefulLeave, reasonCode, description)
    }

    public send(data: Uint8Array): void {
        // TODO: no need to check this.socket as it is always defined when stopped is false?
        if (!this.stopped && this.socket) {
            this.socket.sendMessageBinary(data)
        } else {
            logger.debug('Tried to call send() on a stopped socket')
        }

    }

    public async close(gracefulLeave: boolean): Promise<void> {
        this.emit('disconnected', gracefulLeave, undefined, 'close() called')
        this.removeAllListeners()
        if (!this.stopped) {
            this.socket?.forceClose()
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
                this.socket.forceClose()
                this.socket = undefined
            }
            this.stopped = true
        } else {
            logger.debug('Tried to destroy() a stopped connection')
        }
    }
}
