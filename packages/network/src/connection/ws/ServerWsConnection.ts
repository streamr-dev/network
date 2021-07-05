import { WsConnection } from './WsConnection'
import uWS from 'uWebSockets.js'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'
import { ab2str } from './ServerWsEndpoint'

export const staticLogger = new Logger(module)

export class ServerWsConnection extends WsConnection {
    readonly socket: uWS.WebSocket

    constructor(socket: uWS.WebSocket, peerInfo: PeerInfo) {
        super(peerInfo)
        this.socket = socket
    }

    close(code: DisconnectionCode, reason: DisconnectionReason): void {
        try {
            this.socket.end(code, reason)
        } catch (e) {
            staticLogger.error('failed to gracefully close ws, reason: %s', e)
        }
    }

    terminate() {
        try {
            this.socket.close()
        } catch (e) {
            staticLogger.error('failed to terminate ws, reason: %s', e)
        }
    }

    getBufferedAmount(): number {
        return this.socket.getBufferedAmount()
    }

    getRemoteAddress(): string {
        return ab2str(this.socket.getRemoteAddressAsText())
    }

    // TODO: toString() representatin for logging

    sendPing(): void {
        this.socket.ping()
    }

    async send(message: string): Promise<void> {
        this.socket.send(message)
    }
}