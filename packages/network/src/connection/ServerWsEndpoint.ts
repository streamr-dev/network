import { EventEmitter } from 'events'
import { DisconnectionCode, DisconnectionReason, Event } from './IWsEndpoint'
import uWS from 'uWebSockets.js'
import { PeerBook } from './PeerBook'
import { PeerInfo } from './PeerInfo'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import { Rtts } from '../identifiers'

const staticLogger = new Logger(module)

//interface UWSConnection extends uWS.WebSocket, Connection {}

class UWSConnection {
    private readonly socket: uWS.WebSocket
    public readonly peerInfo: PeerInfo

    respondedPong = true
    highBackPressure = false
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

    send(message: string): void {
        this.socket.send(message)
    }

    getReadyState(): number {
        return this.socket.readySocket
    }
}

const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
const LOW_BACK_PRESSURE = 1024 * 1024
const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin

function ab2str (buf: ArrayBuffer | SharedArrayBuffer): string {
    return Buffer.from(buf).toString('utf8')
}

export class ServerWsEndpoint extends EventEmitter {
    private readonly serverHost: string
    private readonly serverPort: number
    private readonly wss: uWS.TemplatedApp
    private listenSocket: uWS.us_listen_socket | null
    private readonly peerInfo: PeerInfo
    private readonly advertisedWsUrl: string | null

    private readonly logger: Logger
    private readonly connectionById: Map<string, UWSConnection> // id => connection
    private readonly connectionByUwsSocket: Map<uWS.WebSocket, UWSConnection> // uws.websocket => connection, interaction with uws events
    private readonly peerBook: PeerBook
    private readonly pingInterval: NodeJS.Timeout
    private readonly metrics: Metrics

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
        this.peerBook = new PeerBook()

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
                    connection.respondedPong = true
                    connection.rtt = Date.now() - connection.rttStart!
                }
            }
        })

        this.logger.trace('listening on %s', this.getAddress())
        this.pingInterval = setInterval(() => this.pingConnections(), pingInterval)

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
                return [...this.connectionById.values()]
                    .reduce((totalBufferSizeSum, connection) => totalBufferSizeSum + connection.getBufferedAmount(), 0)
            })
    }

    private pingConnections(): void {
        this.connectionByUwsSocket.forEach((connection, ws) => {
            try {
                // didn't get "pong" in pingInterval
                if (!connection.respondedPong) {
                    throw new Error('ws is not active')
                }

                // eslint-disable-next-line no-param-reassign
                connection.respondedPong = false
                connection.rttStart = Date.now()
                connection.ping()
                this.logger.trace('pinging %s (current rtt %s)', connection.getPeerId(), connection.rtt)
            } catch (e) {
                this.logger.warn(`failed pinging %s, error %s, terminating connection`, connection.getPeerId(), e)
                connection.terminate()
            }
        })
    }

    send(recipientId: string, message: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (!this.isConnected(recipientId)) {
                this.metrics.record('sendFailed', 1)
                this.logger.trace('cannot send to %s, not connected', recipientId)
                reject(new Error(`cannot send to ${recipientId} because not connected`))
            } else {
                const connection = this.connectionById.get(recipientId)!
                this.socketSend(connection, message, recipientId, resolve, reject)
            }
        })
    }

    private socketSend(
        connection: UWSConnection,
        message: string,
        recipientId: string,
        successCallback: (peerId: string) => void,
        errorCallback: (err: Error) => void
    ): void {
        const onSuccess = (address: string, peerId: string, msg: string): void => {
            this.logger.trace('sent to %s [%s] message "%s"', recipientId, address, msg)
            this.metrics.record('outSpeed', msg.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgOutSpeed', 1)
            successCallback(peerId)
        }

        try {
            connection.send(message)
            onSuccess(connection.getRemoteAddress(), recipientId, message)
            this.evaluateBackPressure(connection)
        } catch (e) {
            this.metrics.record('sendFailed', 1)
            this.logger.warn('sending to %s [%s] failed, reason %s, readyState is %s',
                recipientId, connection.getRemoteAddress(), e, connection.getReadyState())
            errorCallback(e)
            connection.terminate()
        }
    }

    private evaluateBackPressure(connection: UWSConnection): void {
        const bufferedAmount = connection.getBufferedAmount()
        if (!connection.highBackPressure && bufferedAmount > HIGH_BACK_PRESSURE) {
            this.logger.trace('Back pressure HIGH for %s at %d', connection.peerInfo, bufferedAmount)
            this.emit(Event.HIGH_BACK_PRESSURE, connection.peerInfo)
            connection.highBackPressure = true
        } else if (connection.highBackPressure && bufferedAmount < LOW_BACK_PRESSURE) {
            this.logger.trace('Back pressure LOW for %s at %d', connection.peerInfo, bufferedAmount)
            this.emit(Event.LOW_BACK_PRESSURE, connection.peerInfo)
            connection.highBackPressure = false
        }
    }

    private onReceive(connection: UWSConnection, message: string): void {
        this.logger.trace('<== received from %s [%s] message "%s"', connection.peerInfo, connection.getRemoteAddress(), message)
        this.emit(Event.MESSAGE_RECEIVED, connection.peerInfo, message)
    }

    close(recipientId: string, reason = DisconnectionReason.GRACEFUL_SHUTDOWN): void {
        this.metrics.record('close', 1)
        if (!this.isConnected(recipientId)) {
            this.logger.trace('cannot close connection to %s because not connected', recipientId)
        } else {
            const connection = this.connectionById.get(recipientId)!
            try {
                this.logger.trace('closing connection to %s, reason %s', recipientId, reason)
                connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, reason)
            } catch (e) {
                this.logger.warn('closing connection to %s failed because of %s', recipientId, e)
            }
        }
    }

    stop(): Promise<void> {
        clearInterval(this.pingInterval)

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

    getRtts(): Rtts {
        const rtts: Rtts = {}
        this.connectionById.forEach((connection) => {
            if (connection.rtt !== undefined) {
                rtts[connection.getPeerId()] = connection.rtt
            }
        })
        return rtts
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
        //this.peerBook.add(address, peerInfo)
        this.connectionById.set(peerId, uwsConnection)
        this.connectionByUwsSocket.set(ws, uwsConnection)
        this.metrics.record('open', 1)
        this.logger.trace('added %s [%s] to connection list', peerId, uwsConnection.getRemoteAddress())
        this.emit(Event.PEER_CONNECTED, uwsConnection.peerInfo)
        return true
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