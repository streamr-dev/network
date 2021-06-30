import uWS from 'uWebSockets.js'
import { PeerInfo } from './PeerInfo'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import { PingPongWs } from "./PingPongWs"
import {
    AbstractWsEndpoint,
    DisconnectionCode,
    DisconnectionReason,
    Event, HIGH_BACK_PRESSURE, SharedConnection,
} from "./AbstractWsEndpoint"

const staticLogger = new Logger(module)

class UWSConnection implements SharedConnection {
    private readonly socket: uWS.WebSocket
    public readonly peerInfo: PeerInfo

    highBackPressure = false
    respondedPong = true
    rtt?: number
    rttStart?: number

    constructor(socket: uWS.WebSocket, peerInfo: PeerInfo) {
        this.socket = socket
        this.peerInfo = peerInfo
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

    getPeerId(): string {
        return this.peerInfo.peerId
    }

    getBufferedAmount(): number {
        return this.socket.getBufferedAmount()
    }

    getRemoteAddress(): string {
        return ab2str(this.socket.getRemoteAddressAsText())
    }

    // TODO: toString() representatin for logging

    ping(): void {
        this.socket.ping()
    }

    async send(message: string): Promise<void> {
        this.socket.send(message)
    }
}

const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin

function ab2str (buf: ArrayBuffer | SharedArrayBuffer): string {
    return Buffer.from(buf).toString('utf8')
}

export class ServerWsEndpoint extends AbstractWsEndpoint {
    private readonly serverHost: string
    private readonly serverPort: number
    private readonly wss: uWS.TemplatedApp
    private listenSocket: uWS.us_listen_socket | null
    private readonly peerInfo: PeerInfo
    private readonly advertisedWsUrl: string | null

    private readonly connectionById: Map<string, UWSConnection> // id => connection
    private readonly connectionByUwsSocket: Map<uWS.WebSocket, UWSConnection> // uws.websocket => connection, interaction with uws events
    protected readonly pingPongWs: PingPongWs
    protected readonly logger: Logger
    protected readonly metrics: Metrics

    constructor(
        host: string,
        port: number,
        wss: uWS.TemplatedApp,
        listenSocket: uWS.us_listen_socket,
        peerInfo: PeerInfo,
        advertisedWsUrl: string | null,
        metricsContext = new MetricsContext(peerInfo.peerId),
        pingInterval = 5 * 1000
    ) {
        super()

        if (!wss) {
            throw new Error('wss not given')
        }
        if (!(peerInfo instanceof PeerInfo)) {
            throw new Error('peerInfo not instance of PeerInfo')
        }
        if (advertisedWsUrl === undefined) {
            throw new Error('advertisedWsUrl not given')
        }

        this.serverHost = host
        this.serverPort = port
        this.wss = wss
        this.listenSocket = listenSocket
        this.peerInfo = peerInfo
        this.advertisedWsUrl = advertisedWsUrl

        this.logger = new Logger(module)
        this.connectionById = new Map()
        this.connectionByUwsSocket = new Map()
        this.pingPongWs = new PingPongWs(() => this.getConnections(), pingInterval)

        this.wss.ws('/ws', {
            compression: 0,
            maxPayloadLength: 1024 * 1024,
            maxBackpressure: WS_BUFFER_SIZE,
            idleTimeout: 0,
            upgrade: (res, req, context) => {
                res.writeStatus('101 Switching Protocols')
                    .writeHeader('streamr-peer-id', this.peerInfo.peerId)

                /* This immediately calls open handler, you must not use res after this call */
                res.upgrade({
                    peerId: req.getHeader('streamr-peer-id')
                },
                /* Spell these correctly */
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context)
            },
            open: (ws) => {
                this.onIncomingConnection(ws)
            },
            message: (ws, message, _isBinary) => {
                const connection = this.connectionByUwsSocket.get(ws)
                if (connection) {
                    this.onReceive(connection, ab2str(message))
                }
            },
            drain: (ws) => {
                const connection = this.connectionByUwsSocket.get(ws)
                if (connection) {
                    this.evaluateBackPressure(connection)
                }
            },
            close: (ws, code, message) => {
                const reason = ab2str(message)

                const connection = this.connectionByUwsSocket.get(ws)
                if (connection) {
                    this.onClose(connection, ws, code, reason)
                }
            },
            pong: (ws) => {
                const connection = this.connectionByUwsSocket.get(ws)

                if (connection) {
                    this.logger.trace('received from %s "pong" frame', connection.getRemoteAddress())
                    this.pingPongWs.onPong(connection)
                }
            }
        })

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
            .addQueriedMetric('connections', () => this.connectionById.size)
            .addQueriedMetric('rtts', () => this.getRtts())
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return this.getConnections()
                    .reduce((totalBufferSizeSum, connection) => totalBufferSizeSum + connection.getBufferedAmount(), 0)
            })
    }

    stop(): Promise<void> {
        this.pingPongWs.stop()

        return new Promise<void>((resolve, reject) => {
            try {
                /*this.connectionById.forEach((connection) => {
                    connection.closeTemp(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
                })*/

                if (this.listenSocket) {
                    this.logger.trace('shutting down uWS server')
                    uWS.us_listen_socket_close(this.listenSocket)
                    this.listenSocket = null
                }

                setTimeout(() => resolve(), 100)
            } catch (e) {
                this.logger.error('error while shutting down uWS server: %s', e)
                reject(new Error(`Failed to stop websocket server, because of ${e}`))
            }
        })
    }

    isConnected(peerId: string): boolean {
        return this.connectionById.has(peerId)
    }

    getAddress(): string {
        if (this.advertisedWsUrl) {
            return this.advertisedWsUrl
        }
        return `ws://${this.serverHost}:${this.serverPort}`
    }

    getWss(): uWS.TemplatedApp {
        return this.wss
    }

    getPeerInfo(): Readonly<PeerInfo> {
        return this.peerInfo
    }

    getPeers(): ReadonlyMap<string, UWSConnection> {
        return this.connectionById
    }

    getPeerInfos(): PeerInfo[] {
        return Array.from(this.connectionById.values())
            .map((connection) => connection.peerInfo)
    }

    // TODO: maybe return undefined instead of throwing when unknown peerId
    resolveAddress(peerId: string): string | never {
        if (!this.connectionById.has(peerId)) {
            throw new Error(`resolveAddress: ${peerId} not found`)
        }
        return this.connectionById.get(peerId)!.getRemoteAddress()
    }

    private onIncomingConnection(ws: uWS.WebSocket): void {
        const { peerId } = ws // monkey-patched in upgrade

        try {
            if (!peerId) {
                throw new Error('peerId not given')
            }

            // TODO: should this actually close the existing connection and keep the new one? It could be that the node
            // has re-connected after dropping but the server has yet to detect this.
            if (this.isConnected(peerId)) {
                this.metrics.record('open:duplicateSocket', 1)
                ws.close()
                return
            }

            this.logger.trace('<=== %s connecting to me', peerId)
            this.onNewConnection(ws, peerId)
        } catch (e) {
            this.logger.trace('dropped incoming connection because of %s', e)
            this.metrics.record('open:missingParameter', 1)
            ws.end(DisconnectionCode.MISSING_REQUIRED_PARAMETER, e.toString()) // TODO: reason not necessarily missing require parameter
        }
    }

    private onClose(connection: UWSConnection, ws: uWS.WebSocket, code = 0, reason = ''): void {
        if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
            this.metrics.record('open:duplicateSocket', 1)
        }

        this.metrics.record('close', 1)
        this.logger.trace('socket to %s closed (code %d, reason %s)',
            connection.getPeerId(), code, reason)
        this.connectionById.delete(connection.peerInfo.peerId)
        this.connectionByUwsSocket.delete(ws)
        this.logger.trace('removed %s from connection list', connection.getPeerId())
        this.emit(Event.PEER_DISCONNECTED, connection.peerInfo, reason)
    }

    private onNewConnection(
        ws: uWS.WebSocket,
        peerId: string
    ): boolean {
        const uwsConnection = new UWSConnection(ws, PeerInfo.newNode(peerId))
        this.connectionById.set(peerId, uwsConnection)
        this.connectionByUwsSocket.set(ws, uwsConnection)
        this.metrics.record('open', 1)
        this.logger.trace('added %s [%s] to connection list', peerId, uwsConnection.getRemoteAddress())
        this.emit(Event.PEER_CONNECTED, uwsConnection.peerInfo)
        return true
    }

    private getConnections(): Array<UWSConnection> {
        return [...this.connectionById.values()]
    }

    protected getConnectionByPeerId(peerId: string): SharedConnection | undefined {
        return this.connectionById.get(peerId)
    }

}

export function startWebSocketServer(
    host: string | null,
    port: number,
    privateKeyFileName: string | undefined = undefined,
    certFileName: string | undefined = undefined
): Promise<[uWS.TemplatedApp, any]> {
    return new Promise((resolve, reject) => {
        let server: uWS.TemplatedApp
        if (privateKeyFileName && certFileName) {
            staticLogger.trace(`starting SSL uWS server (host: ${host}, port: ${port}, using ${privateKeyFileName}, ${certFileName}`)
            server = uWS.SSLApp({
                key_file_name: privateKeyFileName,
                cert_file_name: certFileName,
            })
        } else {
            staticLogger.trace(`starting non-SSL uWS (host: ${host}, port: ${port}`)
            server = uWS.App()
        }

        const cb = (listenSocket: uWS.us_listen_socket): void => {
            if (listenSocket) {
                resolve([server, listenSocket])
            } else {
                reject(new Error(`Failed to start websocket server, host ${host}, port ${port}`))
            }
        }

        if (host) {
            server.listen(host, port, cb)
        } else {
            server.listen(port, cb)
        }
    })
}

export async function startServerWsEndpoint(
    host: string,
    port: number,
    peerInfo: PeerInfo,
    advertisedWsUrl: string | null,
    metricsContext?: MetricsContext,
    pingInterval?: number | undefined,
    privateKeyFileName?: string | undefined,
    certFileName?: string | undefined,
): Promise<ServerWsEndpoint> {
    return startWebSocketServer(host, port, privateKeyFileName, certFileName).then(([wss, listenSocket]) => {
        return new ServerWsEndpoint(host, port, wss, listenSocket, peerInfo, advertisedWsUrl, metricsContext, pingInterval)
    })
}