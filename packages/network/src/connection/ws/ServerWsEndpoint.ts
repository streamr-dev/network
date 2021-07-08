import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason, } from "./AbstractWsEndpoint"
import { staticLogger, ServerWsConnection } from './ServerWsConnection'
import fs from 'fs'
import https from 'https'
import http from 'http'
import WebSocket from 'ws'
import { once } from 'events'

export class ServerWsEndpoint extends AbstractWsEndpoint<ServerWsConnection> {
    private readonly serverUrl: string
    private readonly httpServer: http.Server | https.Server
    private readonly wss: WebSocket.Server

    constructor(
        host: string,
        port: number,
        sslEnabled: boolean,
        httpServer: http.Server | https.Server,
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)

        this.httpServer = httpServer
        this.serverUrl = `${sslEnabled ? 'wss' : 'ws'}://${host}:${port}`

        /* TODO:
            compression: 0,
            maxPayloadLength: 1024 * 1024,
            maxBackpressure: WS_BUFFER_SIZE,
            idleTimeout: 0,
     */
        this.wss = new WebSocket.Server({
            server: httpServer,
            maxPayload: 1024 * 1024
        })

        this.wss.on('headers', (headers: string[]) => {
            headers.push(`${AbstractWsEndpoint.PEER_ID_HEADER}: ${this.peerInfo.peerId}`)
        })
        this.wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
            const peerId: string | string[] | undefined = request.headers.peerId

            if (Array.isArray(peerId)) {
                this.logger.trace(`dropped new connection: ${AbstractWsEndpoint.PEER_ID_HEADER} set multiple times.`)
                this.metrics.record('open:missingParameter', 1)
                ws.close(DisconnectionCode.MISSING_REQUIRED_PARAMETER, `${AbstractWsEndpoint.PEER_ID_HEADER} set multiple times.`)
            } else if (peerId === undefined) {
                this.logger.trace(`dropped new connection: ${AbstractWsEndpoint.PEER_ID_HEADER} not set.`)
                this.metrics.record('open:missingParameter', 1)
                ws.close(DisconnectionCode.MISSING_REQUIRED_PARAMETER, `${AbstractWsEndpoint.PEER_ID_HEADER} missing`)
            } else if (this.getConnectionByPeerId(peerId) !== undefined) {
                // TODO: should this actually close the existing connection and keep the new one? It could be that the node
                // has re-connected after dropping but the server has yet to detect this.
                this.metrics.record('open:duplicateSocket', 1)
                ws.close()
            } else {
                const connection = new ServerWsConnection(ws, request.socket.remoteAddress!, PeerInfo.newNode(peerId))
                ws.on('message', (data: WebSocket.Data) => {
                    this.onReceive(connection, data.toString())
                })
                ws.on('pong', () => {
                    connection.onPong()
                })
                ws.on('close', (code: number, reason: string) => {
                    this.onClose(connection, code, reason as DisconnectionReason)
                })
                ws.on('error', (err) => {
                    this.logger.warn('socket for "%s" emitted error: %s', this.peerInfo.peerId, err)
                })
                // TODO: drain
                this.onNewConnection(connection)
            }
        })
        this.wss.on('error', (err: Error) => {
            this.logger.warn('web socket server (wss) emitted error: %s', err)
        })
        this.wss.on('listening', () => {
            this.logger.trace('listening on %s', this.getUrl())
        })
    }

    getUrl(): string {
        return this.serverUrl
    }

    resolveAddress(peerId: string): string | undefined {
        return this.getConnectionByPeerId(peerId)?.getRemoteAddress()
    }

    protected doClose(_connection: ServerWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void {}

    protected async doStop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.wss.close((err?) => {
                if (err) {
                    this.logger.error('error on closing websocket server: %s', err)
                }
                this.httpServer.close((err?) => {
                    if (err) {
                        this.logger.error('error closing http server: %s', err)
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        })
    }
}

export async function startHttpServer(
    host: string | null,
    port: number,
    privateKeyFileName: string | undefined = undefined,
    certFileName: string | undefined = undefined
): Promise<http.Server | https.Server> {
    let httpServer: http.Server | https.Server
    if (privateKeyFileName && certFileName) {
        const opts = {
            key: fs.readFileSync(privateKeyFileName),
            cert: fs.readFileSync(certFileName)
        }
        httpServer = https.createServer(opts)
    } else if (privateKeyFileName === undefined && certFileName === undefined) {
        httpServer = http.createServer()
    } else {
        throw new Error('must supply both privateKeyFileName and certFileName or neither')
    }

    httpServer.listen(port)
    await once(httpServer, 'listening')
    staticLogger.info(`started on port %s`, port)
    return httpServer
}