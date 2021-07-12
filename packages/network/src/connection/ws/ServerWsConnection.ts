import { ReadyState, WsConnection } from './WsConnection'
import { PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'
import WebSocket from 'ws'
import util from 'util'
import stream from 'stream'

export const staticLogger = new Logger(module)

export class ServerWsConnection extends WsConnection {
    private readonly socket: WebSocket
    private readonly duplexStream: stream.Duplex
    private readonly remoteAddress: string | undefined

    constructor(socket: WebSocket, duplexStream: stream.Duplex, remoteAddress: string | undefined, peerInfo: PeerInfo) {
        super(peerInfo)
        this.socket = socket
        this.duplexStream = duplexStream
        this.remoteAddress = remoteAddress
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

    getReadyState(): ReadyState {
        return this.socket.readyState
    }

    sendPing(): void {
        this.socket.ping()
    }

    async send(message: string): Promise<void> {
        // Error handling is needed here because otherwise this.duplexStream itself will throw an unhandled error
        const readyState = this.getReadyState()
        if (this.getReadyState() !== 1) {
            throw new Error(`cannot send, readyState is ${readyState}`)
        }
        await util.promisify((cb: any) => this.duplexStream.write(message, cb))()
    }

    getRemoteAddress(): string | undefined {
        return this.remoteAddress
    }
}