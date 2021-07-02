import WebSocket from 'ws'
import util from 'util'
import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { Logger } from '../../helpers/Logger'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason, SharedConnection, } from "./AbstractWsEndpoint"

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
        [AbstractWsEndpoint.PEER_ID_HEADER]: peerInfo.peerId
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
        // Check for existing connection and its state
        const existingConnection = this.connectionsByServerUrl.get(serverUrl)
        if (existingConnection !== undefined) {
            if (existingConnection.getReadyState() === WebSocket.OPEN) {
                return Promise.resolve(existingConnection.getPeerId())
            }
            this.logger.trace('supposedly connected to %s but readyState is %s, closing connection',
                serverUrl,
                existingConnection.getReadyState()
            )
            this.close(
                existingConnection.getPeerId(),
                DisconnectionCode.DEAD_CONNECTION,
                DisconnectionReason.DEAD_CONNECTION
            )
        }

        // Check for pending connection
        const pendingConnection = this.pendingConnections.get(serverUrl)
        if (pendingConnection !== undefined) {
            return pendingConnection
        }

        // Perform connection
        this.logger.trace('connecting to %s', serverUrl)
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

                ws.once('upgrade', (res) => {
                    const peerId = res.headers[AbstractWsEndpoint.PEER_ID_HEADER] as string
                    if (peerId) {
                        serverPeerInfo = PeerInfo.newTracker(peerId)
                    } else {
                        this.logger.debug('invalid message headers received on upgrade: ' + res)
                    }
                })

                ws.once('open', () => {
                    if (!serverPeerInfo) {
                        ws.terminate()
                        this.metrics.record('open:headersNotReceived', 1)
                        reject(new Error('dropping outgoing connection because connection headers never received'))
                    } else {
                        resolve(this.setUpConnection(ws, serverPeerInfo, serverUrl))
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

    protected async doStop(): Promise<void> {
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

    private setUpConnection(ws: WebSocket, serverPeerInfo: PeerInfo, serverUrl: ServerUrl): PeerId {
        const connection = new WsConnection(ws, serverPeerInfo)

        ws.on('message', (message: string | Buffer | Buffer[]) => {
            this.onReceive(connection, message.toString())
        })
        ws.on('pong', () => {
            this.onPong(connection)
        })
        ws.once('close', (code: number, reason: string): void => {
            this.onClose(connection, code, reason)
        })

        this.connectionsByServerUrl.set(serverUrl, connection)
        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl)
        this.onNewConnection(connection)
        return connection.getPeerId()
    }
}