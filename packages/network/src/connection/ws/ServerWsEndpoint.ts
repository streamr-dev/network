import uWS from 'uWebSockets.js'
import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason, } from "./AbstractWsEndpoint"
import { HIGH_BACK_PRESSURE } from './WsConnection'
import { staticLogger, ServerWsConnection } from './ServerWsConnection'

const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin

export function ab2str(buf: ArrayBuffer | SharedArrayBuffer): string {
    return Buffer.from(buf).toString('utf8')
}

export class ServerWsEndpoint extends AbstractWsEndpoint<ServerWsConnection> {
    private readonly serverUrl: string
    private readonly wss: uWS.TemplatedApp
    private readonly connectionByUwsSocket: Map<uWS.WebSocket, ServerWsConnection>
    private listenSocket: uWS.us_listen_socket | null

    constructor(
        host: string,
        port: number,
        sslEnabled: boolean,
        wss: uWS.TemplatedApp,
        listenSocket: uWS.us_listen_socket,
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)

        if (!wss) {
            throw new Error('wss not given')
        }

        this.connectionByUwsSocket = new Map()

        this.serverUrl = `${sslEnabled ? 'wss' : 'ws'}://${host}:${port}`
        this.wss = wss
        this.listenSocket = listenSocket

        this.wss.ws('/ws', {
            compression: 0,
            maxPayloadLength: 1024 * 1024,
            maxBackpressure: WS_BUFFER_SIZE,
            idleTimeout: 0,
            upgrade: (res, req, context) => {
                res.writeStatus('101 Switching Protocols')
                    .writeHeader(AbstractWsEndpoint.PEER_ID_HEADER, this.peerInfo.peerId)

                /* This immediately calls open handler, you must not use res after this call */
                res.upgrade({
                    peerId: req.getHeader(AbstractWsEndpoint.PEER_ID_HEADER)
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
                    connection.evaluateBackPressure()
                }
            },
            close: (ws, code, message) => {
                const connection = this.connectionByUwsSocket.get(ws)
                if (connection) {
                    this.onClose(connection, code, ab2str(message) as DisconnectionReason)
                }
            },
            pong: (ws) => {
                const connection = this.connectionByUwsSocket.get(ws)
                if (connection) {
                    connection.onPong()
                }
            }
        })

        this.logger.trace('listening on %s', this.getUrl())
    }

    getUrl(): string {
        return this.serverUrl
    }

    resolveAddress(peerId: string): string | undefined {
        return this.getConnectionByPeerId(peerId)?.getRemoteAddress()
    }

    protected doClose(connection: ServerWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void {
        this.connectionByUwsSocket.delete(connection.socket)
    }

    protected async doStop(): Promise<void> {
        if (this.listenSocket) {
            this.logger.trace('shutting down uWS server')
            uWS.us_listen_socket_close(this.listenSocket)
            this.listenSocket = null
        }
        return new Promise((resolve) => setTimeout(resolve, 100))
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

            const connection = new ServerWsConnection(ws, PeerInfo.newNode(peerId))
            this.connectionByUwsSocket.set(ws, connection)
            this.onNewConnection(connection)
        } catch (e) {
            this.logger.trace('dropped incoming connection because of %s', e)
            this.metrics.record('open:missingParameter', 1)
            ws.end(DisconnectionCode.MISSING_REQUIRED_PARAMETER, e.toString()) // TODO: reason not necessarily missing require parameter
        }
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