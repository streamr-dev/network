import { WsConnection } from './WsConnection'
import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'

const staticLogger = new Logger(module)

export class BrowserClientWsConnection extends WsConnection {
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

    getReadyState(): number {
        return this.socket.readyState
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
