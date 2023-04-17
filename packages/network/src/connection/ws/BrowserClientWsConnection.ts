import { ReadyState, AbstractWsConnection } from './AbstractWsConnection'
import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import { Logger } from "@streamr/utils"
import { WebSocketConnectionFactory } from "./AbstractClientWsEndpoint"

const logger = new Logger(module)

export const BrowserWebSocketConnectionFactory: WebSocketConnectionFactory<BrowserClientWsConnection> = Object.freeze({
    createConnection(socket: w3cwebsocket, peerInfo: PeerInfo): BrowserClientWsConnection {
        return new BrowserClientWsConnection(socket, peerInfo)
    }
})

export class BrowserClientWsConnection extends AbstractWsConnection {
    private readonly socket: w3cwebsocket

    constructor(socket: w3cwebsocket, peerInfo: PeerInfo) {
        super(peerInfo)
        this.socket = socket
    }

    close(code: DisconnectionCode, reason: DisconnectionReason): void {
        try {
            this.socket.close(code, reason)
        } catch (err) {
            logger.error('Failed to close connection', err)
        }
    }

    terminate(): void {
        try {
            this.socket.close()
        } catch (err) {
            logger.error('Failed to terminate connection', err)
        }
    }

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    getReadyState(): ReadyState {
        return this.socket.readyState as ReadyState
    }

    // TODO: toString() representation for logging

    sendPing(): void {
        this.socket.send('ping')
    }

    async send(message: string): Promise<void> {
        this.socket.send(message)
    }
}
