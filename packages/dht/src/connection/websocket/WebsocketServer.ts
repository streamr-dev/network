import { createServer as createHttpServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'http'
import { createServer as createHttpsServer, Server as HttpsServer } from 'https'
import EventEmitter from 'eventemitter3'
import WebSocket from 'ws'
import { WebsocketServerConnection } from './WebsocketServerConnection'
import { Logger, asAbortable } from '@streamr/utils'
import { createSelfSignedCertificate } from '@streamr/autocertifier-client'
import { WebsocketServerStartError } from '../../helpers/errors'
import { PortRange, TlsCertificate } from '../ConnectionManager'
import { range } from 'lodash'
import fs from 'fs'
import { v4 as uuid } from 'uuid'
import { parse } from 'url'
import { IConnection } from '../IConnection'

const logger = new Logger(module)

interface WebsocketServerOptions {
    portRange: PortRange
    enableTls: boolean
    tlsCertificate?: TlsCertificate
    maxMessageSize?: number
}

interface Events {
    connected: (connection: IConnection) => void
}

export class WebsocketServer extends EventEmitter<Events> {
    private httpServer?: HttpServer | HttpsServer
    private wsServer?: WebSocket.Server
    private readonly abortController = new AbortController()
    private readonly options: WebsocketServerOptions

    constructor(options: WebsocketServerOptions) {
        super()
        this.options = options
    }

    public async start(): Promise<number> {
        const ports = range(this.options.portRange.min, this.options.portRange.max + 1)
        for (const port of ports) {
            try {
                await asAbortable(this.startServer(port, this.options.enableTls), this.abortController.signal)
                return port
            } catch (err) {
                if (err.originalError?.code === 'EADDRINUSE') {
                    logger.debug(`failed to start WebSocket server on port: ${port} reattempting on next port`)
                } else {
                    throw new WebsocketServerStartError(err)
                }
            }
        }
        throw new WebsocketServerStartError(
            `Failed to start WebSocket server on any port in range: ${this.options.portRange.min}-${this.options.portRange.min}`
        )
    }

    // If tlsCertificate has been given the tls boolean is ignored
    // TODO: could be simplified?
    private startServer(port: number, tls: boolean): Promise<void> {
        const requestListener = (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
            logger.trace('Received request for ' + request.url)
            response.writeHead(404)
            response.end()
        }
        return new Promise((resolve, reject) => {
            if (this.options.tlsCertificate) {
                this.httpServer = createHttpsServer(
                    {
                        key: fs.readFileSync(this.options.tlsCertificate.privateKeyFileName),
                        cert: fs.readFileSync(this.options.tlsCertificate.certFileName)
                    },
                    requestListener
                )
            } else if (!tls) {
                this.httpServer = createHttpServer(requestListener)
            } else {
                // TODO use options option or named constant?
                const certificate = createSelfSignedCertificate('streamr-self-signed-' + uuid(), 1000)
                this.httpServer = createHttpsServer(
                    {
                        key: certificate.serverKey,
                        cert: certificate.serverCert
                    },
                    requestListener
                )
            }

            function originIsAllowed() {
                return true
            }

            this.wsServer = this.createWsServer()

            this.wsServer.on('connection', (ws: WebSocket, request: IncomingMessage) => {
                logger.trace(`New connection from ${request.socket.remoteAddress}`)
                if (!originIsAllowed()) {
                    // Make sure we only accept requests from an allowed origin
                    ws.close()
                    logger.trace('IConnection from origin ' + request.headers.origin + ' rejected.')
                    return
                }
                this.emit(
                    'connected',
                    new WebsocketServerConnection(ws, parse(request.url!), request.socket.remoteAddress!)
                )
            })

            this.httpServer.on('upgrade', (request, socket, head) => {
                logger.trace('Received upgrade request for ' + request.url)
                this.wsServer!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                    this.wsServer!.emit('connection', ws, request)
                })
            })

            this.httpServer.once('error', (err: Error) => {
                reject(new WebsocketServerStartError('Starting Websocket server failed', err))
            })

            this.httpServer.once('listening', () => {
                logger.debug('Websocket server is listening on port ' + port)
                resolve()
            })

            try {
                // Listen only to IPv4 network interfaces, default value listens to IPv6 as well
                this.httpServer.listen(port, '0.0.0.0')
            } catch (e) {
                reject(new WebsocketServerStartError('Websocket server threw an exception', e))
            }
        })
    }

    public updateCertificate(cert: string, key: string): void {
        ;(this.httpServer! as HttpsServer).setSecureContext({
            cert,
            key
        })
    }

    public stop(): Promise<void> {
        this.abortController.abort()
        this.removeAllListeners()
        return new Promise((resolve, _reject) => {
            this.wsServer!.close()
            for (const ws of this.wsServer!.clients) {
                ws.terminate()
            }
            this.httpServer?.once('close', () => {
                // removeAllListeners is maybe not needed?
                this.httpServer?.removeAllListeners()
                resolve()
            })
            this.httpServer?.close()
            // the close method "Stops the server from accepting new connections and closes all
            // connections connected to this server which are not sending a request or waiting for a
            // response." (https://nodejs.org/api/http.html#serverclosecallback)
            // i.e. we need to call closeAllConnections() to close the rest of the connections
            // (in practice this closes the active websocket connections)
            this.httpServer?.closeAllConnections()
        })
    }

    private createWsServer(): WebSocket.Server {
        const maxPayload = this.options.maxMessageSize ?? 1048576
        return (this.wsServer = new WebSocket.Server({
            noServer: true,
            maxPayload
        }))
    }
}
