import { ReadyState, AbstractWsConnection } from './AbstractWsConnection'
import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'
import { WebSocketConnectionFactory } from "./AbstractClientWsEndpoint"

const staticLogger = new Logger(module)

export const BrowserWebSocketConnectionFactory: WebSocketConnectionFactory<BrowserClientWsConnection> = Object.freeze({
    createConnection(socket: w3cwebsocket, peerInfo: PeerInfo): BrowserClientWsConnection {
        return new BrowserClientWsConnection(socket, peerInfo)
    },
    cleanUp(): void {

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
        } catch (e) {
            staticLogger.error('failed to close ws, reason: %s', e)
        }
    }

    terminate(): void {
        try {
            this.socket.close()
        } catch (e) {
            staticLogger.error('failed to terminate ws, reason %s', e)
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
        // this.socket.ping()
        this.socket.send('ping')
    }

    async send(message: string): Promise<void> {
        this.socket.send(message)
        // await util.promisify((cb: any) => this.socket.send(message))()
    }
}
