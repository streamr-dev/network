import { createServer as createHttpServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'http'
import { createServer as createHttpsServer, Server as HttpsServer } from 'https'
import EventEmitter from 'eventemitter3'
import { server as WsServer } from 'websocket'
import { ServerWebsocket } from './ServerWebsocket'
import { ConnectionSourceEvents } from '../IConnectionSource'
import { Logger, asAbortable } from '@streamr/utils'
import { createSelfSignedCertificate } from '@streamr/autocertifier-client' 
import { WebsocketServerStartError } from '../../helpers/errors'
import { PortRange, TlsCertificate } from '../ConnectionManager'
import { range } from 'lodash'
import fs from 'fs'
import { v4 as uuid } from 'uuid'

const logger = new Logger(module)

// NodeJsWsServer is declared as a global in test-browser Electron tests
// in preload.js using "window.NodeJsWsServer = require('websocket').server".
// This is done in order to use the real nodejs websocket server in tests
// instead of a dummy polyfill.

declare class NodeJsWsServer extends WsServer { }

interface WebsocketServerConfig {
    portRange: PortRange
    enableTls: boolean
    tlsCertificate?: TlsCertificate
    maxMessageSize?: number
}

export class WebsocketServer extends EventEmitter<ConnectionSourceEvents> {

    private httpServer?: HttpServer | HttpsServer
    private wsServer?: WsServer
    private readonly abortController = new AbortController()
    private readonly config: WebsocketServerConfig

    constructor(config: WebsocketServerConfig) {
        super()
        this.config = config
    }

    public async start(): Promise<number> {
        const ports = range(this.config.portRange.min, this.config.portRange.max + 1)
        for (const port of ports) {
            try {
                await asAbortable(this.startServer(port, this.config.enableTls), this.abortController.signal)
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
            `Failed to start WebSocket server on any port in range: ${this.config.portRange.min}-${this.config.portRange.min}`
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
            if (this.config.tlsCertificate) {
                this.httpServer = createHttpsServer({
                    key: fs.readFileSync(this.config.tlsCertificate.privateKeyFileName),
                    cert: fs.readFileSync(this.config.tlsCertificate.certFileName)
                }, requestListener)
            } else if (!tls) {
                this.httpServer = createHttpServer(requestListener)
            } else {
                // TODO use config option or named constant?
                const certificate = createSelfSignedCertificate('streamr-self-signed-' + uuid(), 1000)
                this.httpServer = createHttpsServer({
                    key: certificate.serverKey,
                    cert: certificate.serverCert
                }, requestListener)
            }

            function originIsAllowed() {
                return true
            }

            this.wsServer = this.createWsServer(this.httpServer)
            
            this.wsServer.on('request', (request) => {
                if (!originIsAllowed()) {
                    // Make sure we only accept requests from an allowed origin
                    request.reject()
                    logger.trace('IConnection from origin ' + request.origin + ' rejected.')
                    return
                }
                
                let connection
                try {
                    connection = request.accept(undefined, request.origin)
                    logger.trace('Connection accepted.', { remoteAddress: request.remoteAddress })
                } catch (err) {
                    logger.debug('Accepting websocket connection failed', { remoteAddress: request.remoteAddress, err })
                }

                if (connection) {
                    this.emit('connected', new ServerWebsocket(connection, request.resourceURL))
                }
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
        (this.httpServer! as HttpsServer).setSecureContext({
            cert,
            key
        })
    }

    public stop(): Promise<void> {
        this.abortController.abort()
        this.removeAllListeners()
        this.httpServer?.removeAllListeners()
        return new Promise((resolve, _reject) => {
            this.wsServer?.shutDown()
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

    private createWsServer(httpServer: HttpServer | HttpsServer): WsServer {
        const maxReceivedMessageSize = this.config.maxMessageSize ?? 1048576
        // Use the real nodejs WebSocket server in Electron tests
        if (typeof NodeJsWsServer !== 'undefined') {
            return new NodeJsWsServer({
                httpServer,
                autoAcceptConnections: false,
                maxReceivedMessageSize
            })
        } else {
            return this.wsServer = new WsServer({
                httpServer,
                autoAcceptConnections: false,
                maxReceivedMessageSize
            })
        }
    }
}
