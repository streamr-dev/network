import { WsConnection } from './WsConnection'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'
import WebSocket from 'ws'
import util from 'util'

export const staticLogger = new Logger(module)

export class ServerWsConnection extends WsConnection {
    private readonly socket: WebSocket
    private readonly remoteAddress: string

    constructor(socket: WebSocket, remoteAddress: string, peerInfo: PeerInfo) {
        super(peerInfo)
        this.remoteAddress = remoteAddress
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
            this.socket.terminate()
        } catch (e) {
            staticLogger.error('failed to terminate ws, reason %s', e)
        }
    }

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    getReadyState(): 0 | 1 | 2 | 3 {
        return this.socket.readyState
    }

    // TODO: toString() representation for logging

    sendPing(): void {
        this.socket.ping()
    }

    async send(message: string): Promise<void> {
        await util.promisify((cb: any) => this.socket.send(message, cb))()
    }

    getRemoteAddress(): string {
        return this.remoteAddress
    }
}