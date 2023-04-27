import { PeerId, PeerInfo } from '../PeerInfo'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason, } from "./AbstractWsEndpoint"
import { ServerWsConnection } from './ServerWsConnection'
import fs from 'fs'
import net from 'net'
import https from 'https'
import http from 'http'
import WebSocket from 'ws'
import { once } from 'events'
import { v4 } from 'uuid'
import { Duplex } from "stream"
import { Logger } from '@streamr/utils'

interface HostPort {
    hostname: string
    port: number
}
type UnixSocket = string

export type HttpServerConfig = HostPort | UnixSocket

const logger = new Logger(module)

export class ServerWsEndpoint extends AbstractWsEndpoint<ServerWsConnection> {
    private readonly serverUrl: string
    private readonly httpServer: http.Server | https.Server
    private readonly wss: WebSocket.Server
    constructor(
        listen: HttpServerConfig,
        sslEnabled: boolean,
        httpServer: http.Server | https.Server,
        peerInfo: PeerInfo,
        pingInterval: number
    ) {
        super(peerInfo, pingInterval)

        this.httpServer = httpServer
        const protocol = sslEnabled ? 'wss' : 'ws'
        if (typeof listen !== "string") {
            this.serverUrl = `${protocol}://${listen.hostname}:${listen.port}`
        } else {
            this.serverUrl = `${protocol}+unix://${listen}`
        }
        this.wss = this.startWsServer()
    }

    private startWsServer(): WebSocket.Server {
        return new WebSocket.Server({
            server: this.httpServer,
            maxPayload: 1024 * 1024
        }).on('error', (err: Error) => {
            logger.error('Encountered error (emitted by WebSocket.Server)', { err })
        }).on('listening', () => {
            logger.trace('Started', { url: this.getUrl() })
        }).on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
            const handshakeUUID = v4()

            this.handshakeTimeoutRefs[handshakeUUID] = setTimeout(() => {
                ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`)
                logger.warn('Timed out waiting for handshake from connection', { handshakeUUID })
                ws.terminate()
                delete this.handshakeTimeoutRefs[handshakeUUID]
            }, this.handshakeTimer)

            ws.send(JSON.stringify({ uuid: handshakeUUID, peerId: this.peerInfo.peerId }))

            const duplexStream = WebSocket.createWebSocketStream(ws, {
                decodeStrings: false
            })

            let otherNodeIdForLogging = 'unknown (no handshake)'

            duplexStream.on('data', async (data: WebSocket.Data) => {
                try {
                    const { uuid, peerId } = JSON.parse(data.toString())
                    if (uuid === handshakeUUID && peerId) {
                        otherNodeIdForLogging = peerId
                        this.clearHandshake(uuid)

                        // Check that a client with the same peerId has not already connected to the server.
                        if (!this.getConnectionByPeerId(peerId)) {
                            this.acceptConnection(ws, duplexStream, peerId, this.resolveIP(request))
                        } else {
                            const failedMessage = `Connection for node: ${peerId} has already been established, rejecting duplicate`
                            ws.close(DisconnectionCode.DUPLICATE_SOCKET, failedMessage)
                            logger.warn('Reject duplicate connection (connection to peer has already been established)', {
                                peerId
                            })
                        }
                    } else {
                        logger.trace('Received unexpected message (expected handshake message)', { message: data.toString() })
                    }
                } catch (err) {
                    logger.trace('startWsServer', { err })
                }
            })

            ws.on('error', (err) => {
                logger.warn('Encountered error (emitted by socket)', { otherNodeIdForLogging, err })
            })
        })
    }

    acceptConnection(ws: WebSocket, duplexStream: Duplex, peerId: PeerId, remoteAddress: string): void {
        const connection = new ServerWsConnection(
            ws,
            duplexStream,
            remoteAddress,
            PeerInfo.newNode(peerId)
        )

        duplexStream.on('data', async (data: WebSocket.Data) => {
            const parsed = data.toString()
            if (parsed === 'ping') {
                await this.send(peerId, 'pong')
            } else {
                this.onReceive(connection, data.toString())
            }
        })

        duplexStream.on('drain', () => {
            connection.evaluateBackPressure()
        })

        duplexStream.on('error', (error) => {
            logger.error( 'Encountered error (emitted by DuplexStream)', { stack: error.stack as string })
        })

        ws.on('pong', () => {
            connection.onPong()
        })

        ws.on('close', (code: number, reason: Buffer) => {
            this.onClose(connection, code, reason.toString() as DisconnectionReason)
        })

        this.onNewConnection(connection)
    }

    getUrl(): string {
        return this.serverUrl
    }

    resolveAddress(peerId: PeerId): string | undefined {
        return this.getConnectionByPeerId(peerId)?.getRemoteAddress()
    }

    // eslint-disable-next-line class-methods-use-this
    protected doClose(_connection: ServerWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void {}

    protected async doStop(): Promise<void> {
        return new Promise((resolve, reject) => {
            for (const ws of this.wss.clients) {
                ws.terminate()
            }
            this.wss.close((err?) => {
                if (err) {
                    logger.error('Encountered error (while closing WebSocket.Server)', { err })
                }
                this.httpServer.close((err?) => {
                    if (err) {
                        logger.error('Encountered error (while closing httpServer)', { err })
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        })
    }

    // eslint-disable-next-line class-methods-use-this
    private resolveIP(request: http.IncomingMessage): string {
        // Accept X-Forwarded-For header on connections from the local machine
        if (request.socket.remoteAddress?.endsWith('127.0.0.1')) {
            return (request.headers['x-forwarded-for'] || request.socket.remoteAddress) as string
        }
        return request.socket.remoteAddress as string
    }
}

function cleanSocket(httpServer: http.Server | https.Server, config: UnixSocket) {
    httpServer.on('error', (err: any) => {
        // rethrow if unexpected error
        if (!err.message.includes('EADDRINUSE')) { throw err }

        logger.info('Try to recover used socket', { config })
        const clientSocket = new net.Socket()
        // socket will automatically close on error
        clientSocket.on('error', (err: any) => {
            // rethrow if unexpected error
            if (!err.message.includes('ECONNREFUSED')) {
                throw err
            }

            // No other server listening
            try {
                logger.trace('Clean unused socket', { config })
                fs.unlinkSync(config)
            } catch (unlinkErr) {
                // ignore error if somehow file was already removed
                if (unlinkErr.code !== 'ENOENT') {
                    throw unlinkErr
                }
            }

            // retry listening
            httpServer.listen(config)
        })

        clientSocket.once('connect', () => {
            // bad news if we are able to connect
            logger.error('Encountered unexpected reserved socket (another server already running?)', { config })
            process.exit(1)
        })
        clientSocket.connect({ path: config })
    })
}

export async function startHttpServer(
    config: HttpServerConfig,
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
    // clean up Unix Socket
    if (typeof config === 'string') {
        cleanSocket(httpServer, config)
    }
    try {
        httpServer.listen(config)
        await once(httpServer, 'listening')
        logger.info('Listen', { details: JSON.stringify(config) })
    } catch (err) {
        // Kill process if started on host/port, else wait for Unix Socket to be cleaned up
        if (typeof config !== "string") {
            logger.error('Failed to start httpServer', err)
            process.exit(1)
        } else {
            await once(httpServer, 'listening')
            logger.info('Listen', { details: JSON.stringify(config) })
        }
    }
    return httpServer
}
