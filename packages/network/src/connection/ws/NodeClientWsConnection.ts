import { ReadyState, AbstractWsConnection } from './AbstractWsConnection'
import WebSocket from 'ws'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import util from 'util'
import { Logger } from "@streamr/utils"
import { WebSocketConnectionFactory } from "./AbstractClientWsEndpoint"

const logger = new Logger(module)

export const NodeWebSocketConnectionFactory: WebSocketConnectionFactory<NodeClientWsConnection> = Object.freeze({
    createConnection(socket: WebSocket, peerInfo: PeerInfo): NodeClientWsConnection {
        return new NodeClientWsConnection(socket, peerInfo)
    }
})

export class NodeClientWsConnection extends AbstractWsConnection {
    private readonly socket: WebSocket

    constructor(socket: WebSocket, peerInfo: PeerInfo) {
        super(peerInfo)
        this.socket = socket
    }

    close(code: DisconnectionCode, reason: DisconnectionReason): void {
        try {
            this.socket.close(code, reason)
        } catch (e) {
            logger.error('Failed to close connection', e)
        }
    }

    terminate(): void {
        try {
            this.socket.terminate()
        } catch (e) {
            logger.error('Failed to terminate connection', e)
        }
    }

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    getReadyState(): ReadyState {
        return this.socket.readyState
    }

    sendPing(): void {
        this.socket.ping()
    }

    async send(message: string): Promise<void> {
        await util.promisify((cb: any) => this.socket.send(message, cb))()
    }
}
