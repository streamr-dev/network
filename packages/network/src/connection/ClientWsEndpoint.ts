import WebSocket from 'ws'
import util from 'util'
import { PeerInfo } from './PeerInfo'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import { PingPongWs } from "./PingPongWs"
import {
    AbstractWsEndpoint,
    DisconnectionCode,
    DisconnectionReason,
    Event, SharedConnection,
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

    getRemoteAddress(): string {
        return "" // TODO: how do we get remote address
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

export class ClientWsEndpoint extends AbstractWsEndpoint {
    private readonly peerInfo: PeerInfo
    private readonly advertisedWsUrl: string | null

    private readonly connectionsByPeerId: Map<PeerId, WsConnection>
    private readonly connectionsByServerUrl: Map<ServerUrl, WsConnection>
    private readonly serverUrlByPeerId: Map<PeerId, ServerUrl>
    private readonly pendingConnections: Map<ServerUrl, Promise<string>>

    protected readonly pingPongWs: PingPongWs
    protected readonly logger: Logger
    protected readonly metrics: Metrics

    constructor(
        peerInfo: PeerInfo,
        advertisedWsUrl: string | null,
        metricsContext = new MetricsContext(peerInfo.peerId),
        pingInterval = 5 * 1000
    ) {
        super()

        if (!(peerInfo instanceof PeerInfo)) {
            throw new Error('peerInfo not instance of PeerInfo')
        }
        if (advertisedWsUrl === undefined) {
            throw new Error('advertisedWsUrl not given')
        }

        this.peerInfo = peerInfo
        this.advertisedWsUrl = advertisedWsUrl

        this.logger = new Logger(module)
        this.connectionsByPeerId = new Map()
        this.connectionsByServerUrl = new Map()
        this.serverUrlByPeerId = new Map()
        this.pendingConnections = new Map()
        this.pingPongWs = new PingPongWs(() => this.getConnections(), pingInterval)

        this.logger.trace('listening on %s', this.getAddress())

        this.metrics = metricsContext.create('WsEndpoint')
            .addRecordedMetric('inSpeed')
            .addRecordedMetric('outSpeed')
            .addRecordedMetric('msgSpeed')
            .addRecordedMetric('msgInSpeed')
            .addRecordedMetric('msgOutSpeed')
            .addRecordedMetric('open')
            .addRecordedMetric('open:duplicateSocket')
            .addRecordedMetric('open:failedException')
            .addRecordedMetric('open:headersNotReceived')
            .addRecordedMetric('open:missingParameter')
            .addRecordedMetric('open:ownAddress')
            .addRecordedMetric('close')
            .addRecordedMetric('sendFailed')
            .addRecordedMetric('webSocketError')
            .addQueriedMetric('connections', () => this.connectionsByPeerId.size)
            .addQueriedMetric('pendingConnections', () => this.pendingConnections.size)
            .addQueriedMetric('rtts', () => this.getRtts())
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return this.getConnections()
                    .reduce((totalBufferSizeSum, connection) => totalBufferSizeSum + connection.getBufferedAmount(), 0)
            })
    }

    connect(serverUrl: ServerUrl): Promise<PeerId> {
        if (this.isConnectedToServerUrl(serverUrl)) {
            const connection = this.connectionsByServerUrl.get(serverUrl)!

            if (connection.getReadyState() === WebSocket.OPEN) {
                this.logger.trace('already connected to %s', serverUrl)
                return Promise.resolve(connection.getPeerId())
            }

            this.logger.trace('already connected to %s, but readyState is %s, closing connection',
                serverUrl, connection.getReadyState())
            this.close(connection.getPeerId())
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
                        connection = this.onNewConnection(ws, serverUrl, serverPeerInfo)
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

    stop(): Promise<void> {
        this.pingPongWs.stop()

        return new Promise<void>((resolve, reject) => {
            try {
                this.getConnections().forEach((connection) => {
                    connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
                })

                setTimeout(() => resolve(), 100)
            } catch (e) {
                this.logger.error('error while shutting down uWS server: %s', e)
                reject(new Error(`Failed to stop websocket server, because of ${e}`))
            }
        })
    }

    isConnectedToServerUrl(serverUrl: string): boolean {
        return this.connectionsByServerUrl.has(serverUrl)
    }

    getAddress(): string {
        // in contrast with ServerWsEndpoint's 
        // `ws://${this.serverHost}:${this.serverPort}`  
        return this.peerInfo.peerId
    }

    getPeers(): ReadonlyMap<string, WsConnection> {
        return this.connectionsByPeerId
    }

    getServerUrlByPeerId(peerId: PeerId): string | undefined {
        return this.serverUrlByPeerId.get(peerId)
    }

    private onClose(connection: WsConnection, serverUrl: ServerUrl, code = 0, reason = ''): void {
        if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
            this.metrics.record('open:duplicateSocket', 1)
        }

        this.metrics.record('close', 1)
        this.logger.trace('socket to %s closed (code %d, reason %s)', connection.getPeerId(), code, reason)
        this.connectionsByPeerId.delete(connection.getPeerId())
        this.connectionsByServerUrl.delete(serverUrl)
        this.serverUrlByPeerId.delete(connection.getPeerId())
        this.logger.trace('removed %s from connection list', connection.getPeerId())
        this.emit(Event.PEER_DISCONNECTED, connection.peerInfo, reason)
    }

    private onNewConnection(
        ws: WebSocket,
        serverUrl: ServerUrl,
        serverPeerInfo: PeerInfo
    ): WsConnection {

        const connection = new WsConnection(ws, serverPeerInfo)
        this.addListeners(ws, connection, serverUrl)
        this.connectionsByPeerId.set(connection.getPeerId(), connection)
        this.connectionsByServerUrl.set(serverUrl, connection)
        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl)
        this.metrics.record('open', 1)
        this.logger.trace('added %s [%s] to connection list', connection.getPeerId(), serverUrl)
        this.emit(Event.PEER_CONNECTED, connection.peerInfo)

        return connection
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

            this.onClose(connection, serverUrl, code, reason)
        })
    }

    private getConnections(): Array<WsConnection> {
        return [...this.connectionsByPeerId.values()]
    }

    protected getConnectionByPeerId(peerId: string): SharedConnection | undefined {
        return this.connectionsByPeerId.get(peerId)
    }
}

// made it async to match the startEndpoint method on WsServer
export async function startClientWsEndpoint(
    peerInfo: PeerInfo,
    advertisedWsUrl?: string | null,
    metricsContext?: MetricsContext,
    pingInterval?: number | undefined
): Promise<ClientWsEndpoint> {
    return new ClientWsEndpoint(peerInfo, advertisedWsUrl!, metricsContext, pingInterval)
}