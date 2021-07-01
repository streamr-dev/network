import WebSocket from 'ws'
import util from 'util'
import { PeerInfo } from './PeerInfo'
import { MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import {
    AbstractWsEndpoint,
    DisconnectionCode,
    DisconnectionReason,
    SharedConnection,
} from "./AbstractWsEndpoint"

const staticLogger = new Logger(module)

class WsConnection implements SharedConnection {
    private readonly socket: WebSocket
    public readonly peerInfo: PeerInfo

    highBackPressure = false
    respondedPong = true
    rtt?: number
    rttStart?: number

    constructor(socket: WebSocket, peerInfo: PeerInfo) {
        this.socket = socket
        this.peerInfo = peerInfo
    }

    close(code: DisconnectionCode, reason: DisconnectionReason): void {
        try {
            this.socket.close(code, reason)
        } catch (e) {
            staticLogger.error('failed to close ws, reason: %s', e)
        }
    }

    terminate() {
        try {
            this.socket.terminate()
        } catch (e) {
            staticLogger.error('failed to terminate ws, reason %s', e)
        }
    }

    getPeerId(): string {
        return this.peerInfo.peerId
    }

    getBufferedAmount(): number {
        return this.socket.bufferedAmount
    }

    getReadyState(): 0 | 1 | 2 | 3 {
        return this.socket.readyState
    }

    // TODO: toString() representation for logging

    ping(): void {
        this.socket.ping()
    }

    async send(message: string): Promise<void> {
        await util.promisify((cb: any) => this.socket.send(message, cb))()
    }
}

function toHeaders(peerInfo: PeerInfo): { [key: string]: string } {
    return {
        'streamr-peer-id': peerInfo.peerId
    }
}

type PeerId = string
type ServerUrl = string

export class ClientWsEndpoint extends AbstractWsEndpoint<WsConnection> {
    private readonly connectionsByServerUrl: Map<ServerUrl, WsConnection>
    private readonly serverUrlByPeerId: Map<PeerId, ServerUrl>
    private readonly pendingConnections: Map<ServerUrl, Promise<string>>

    constructor(
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)

        this.connectionsByServerUrl = new Map()
        this.serverUrlByPeerId = new Map()
        this.pendingConnections = new Map()

        this.metrics.addQueriedMetric('pendingConnections', () => this.pendingConnections.size)
    }

    connect(serverUrl: ServerUrl): Promise<PeerId> {
        const existingConnection = this.connectionsByServerUrl.get(serverUrl)
        if (existingConnection !== undefined) {
            if (existingConnection.getReadyState() === WebSocket.OPEN) {
                this.logger.trace('already connected to %s', serverUrl)
                return Promise.resolve(existingConnection.getPeerId())
            }

            this.logger.trace('already connected to %s, but readyState is %s, closing connection',
                serverUrl, existingConnection.getReadyState())
            this.close(existingConnection.getPeerId())
        }

        if (this.pendingConnections.has(serverUrl)) {
            this.logger.trace('pending connection to %s', serverUrl)
            return this.pendingConnections.get(serverUrl)!
        }

        this.logger.trace('===> connecting to %s', serverUrl)

        const p = new Promise<string>((resolve, reject) => {
            try {
                const ws = new WebSocket(
                    `${serverUrl}/ws`,
                    {
                        headers: toHeaders(this.peerInfo)
                    }
                )

                let serverPeerInfo: PeerInfo | undefined
                let connection: WsConnection | undefined

                ws.on('upgrade', (res) => {
                    const peerId = res.headers['streamr-peer-id'] as string

                    if (peerId) {
                        serverPeerInfo = PeerInfo.newTracker(peerId)
                    } else {
                        this.logger.debug('Invalid message headers received on upgrade: ' + res)
                    }
                })

                ws.once('open', () => {
                    if (!serverPeerInfo) {
                        ws.terminate()
                        this.metrics.record('open:headersNotReceived', 1)
                        reject(new Error('dropping outgoing connection because connection headers never received'))
                    } else {
                        connection = new WsConnection(ws, serverPeerInfo)
                        this.addListeners(ws, connection, serverUrl)
                        this.connectionsByServerUrl.set(serverUrl, connection)
                        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl)
                        this.onNewConnection(connection)
                        resolve(connection.getPeerId())
                    }
                })

                ws.on('error', (err) => {
                    this.metrics.record('webSocketError', 1)
                    this.logger.trace('failed to connect to %s, error: %o', serverUrl, err)
                    connection?.terminate()
                    reject(err)
                })
            } catch (err) {
                this.metrics.record('open:failedException', 1)
                this.logger.trace('failed to connect to %s, error: %o', serverUrl, err)
                reject(err)
            }
        }).finally(() => {
            this.pendingConnections.delete(serverUrl)
        })

        this.pendingConnections.set(serverUrl, p)
        return p
    }

    async stop(): Promise<void> {
        this.pingPongWs.stop()
        this.getConnections().forEach((connection) => {
            connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
        })
    }

    getServerUrlByPeerId(peerId: PeerId): string | undefined {
        return this.serverUrlByPeerId.get(peerId)
    }

    protected onClose(connection: WsConnection, code = 0, reason = ''): void {
        super.onClose(connection, code, reason)
        const serverUrl = this.serverUrlByPeerId.get(connection.getPeerId())!
        this.connectionsByServerUrl.delete(serverUrl)
        this.serverUrlByPeerId.delete(connection.getPeerId())
    }

    private addListeners(
        ws: WebSocket,
        connection: WsConnection,
        serverUrl: ServerUrl
    ): void {
        ws.on('message', (message: string | Buffer | Buffer[]) => {
            // TODO check message.type [utf8|binary]
            this.metrics.record('inSpeed', message.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgInSpeed', 1)

            // toString() needed for SSL connections as message will be Buffer instead of String
            setImmediate(() => this.onReceive(connection, message.toString()))
        })

        ws.on('pong', () => {
            this.logger.trace(`=> got pong event ws ${serverUrl}`)
            this.pingPongWs.onPong(connection)
        })

        ws.once('close', (code: number, reason: string): void => {
            if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
                this.metrics.record('open:duplicateSocket', 1)
            }

            this.onClose(connection, code, reason)
        })
    }
}