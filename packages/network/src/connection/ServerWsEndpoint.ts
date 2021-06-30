import uWS from 'uWebSockets.js'
import { PeerInfo } from './PeerInfo'
import { MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import {
    AbstractWsEndpoint,
    DisconnectionCode,
    DisconnectionReason,
    Event, HIGH_BACK_PRESSURE, SharedConnection,
} from "./AbstractWsEndpoint"

const staticLogger = new Logger(module)

class UWSConnection implements SharedConnection {
    readonly socket: uWS.WebSocket
    readonly peerInfo: PeerInfo

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

export class ServerWsEndpoint extends AbstractWsEndpoint<UWSConnection> {
    private readonly serverHost: string
    private readonly serverPort: number
    private readonly wss: uWS.TemplatedApp
    private listenSocket: uWS.us_listen_socket | null
    private readonly connectionByUwsSocket: Map<uWS.WebSocket, UWSConnection> // uws.websocket => connection, interaction with uws events

    constructor(
        host: string,
        port: number,
        wss: uWS.TemplatedApp,
        listenSocket: uWS.us_listen_socket,
        peerInfo: PeerInfo,
        advertisedWsUrl: string | null,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, advertisedWsUrl, metricsContext, pingInterval)

        if (!wss) {
            throw new Error('wss not given')
        }

        this.connectionByUwsSocket = new Map()

        this.wss = wss
        this.listenSocket = listenSocket
        this.serverHost = host
        this.serverPort = port

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
                    this.onClose(connection, code, reason)
                }
            },
            pong: (ws) => {
                const connection = this.connectionByUwsSocket.get(ws)

                if (connection) {
                    this.logger.trace('received from %s "pong" frame', connection.getPeerId())
                    this.pingPongWs.onPong(connection)
                }
            }
        })

        this.logger.trace('listening on %s', this.getAddress())
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
            if (this.getConnectionByPeerId(peerId) !== undefined) {
                this.metrics.record('open:duplicateSocket', 1)
                ws.close()
                return
            }

            const uwsConnection = new UWSConnection(ws, PeerInfo.newNode(peerId))
            this.connectionByUwsSocket.set(ws, uwsConnection)
            this.onNewConnection(uwsConnection)
        } catch (e) {
            this.logger.trace('dropped incoming connection because of %s', e)
            this.metrics.record('open:missingParameter', 1)
            ws.end(DisconnectionCode.MISSING_REQUIRED_PARAMETER, e.toString()) // TODO: reason not necessarily missing require parameter
        }
    }

    protected onClose(connection: UWSConnection, code = 0, reason = ''): void {
        super.onClose(connection, code, reason)
        this.connectionByUwsSocket.delete(connection.socket)
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