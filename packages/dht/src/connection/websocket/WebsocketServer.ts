import EventEmitter from 'eventemitter3'
//import WebSocket from 'ws'
import { WebsocketServerConnection } from './WebsocketServerConnection'
import { ConnectionSourceEvents } from '../IConnectionSource'
import { Logger } from '@streamr/utils'
import { createSelfSignedCertificate } from '@streamr/autocertifier-client'
import { WebsocketServerStartError } from '../../helpers/errors'
import { PortRange, TlsCertificate } from '../ConnectionManager'
import { range } from 'lodash'
import fs from 'fs'
import { v4 as uuid } from 'uuid'
import { parse } from 'url'
import NodeDataChannel from 'node-datachannel'

const logger = new Logger(module)

interface WebsocketServerConfig {
    portRange: PortRange
    enableTls: boolean
    tlsCertificate?: TlsCertificate
    maxMessageSize?: number
}

interface Certs {
    cert: string
    key: string
}

//NodeDataChannel.initLogger('Verbose')
export class WebsocketServer extends EventEmitter<ConnectionSourceEvents> {

    //private httpServer?: HttpServer | HttpsServer
    private wsServer?: NodeDataChannel.WebSocketServer
    private readonly abortController = new AbortController()
    private readonly config: WebsocketServerConfig

    private port?: number
    private tls?: boolean

    constructor(config: WebsocketServerConfig) {
        super()
        this.config = config
    }

    public async start(): Promise<number> {
        const ports = range(this.config.portRange.min, this.config.portRange.max + 1)
        if (ports[0] > 65535 || ports[1] > 65535) {
            throw new WebsocketServerStartError('Port number is too big')
        }

        for (const port of ports) {
            try {
                //await asAbortable(this.startServer(port, this.config.enableTls), this.abortController.signal)
                this.startServer(port, this.config.enableTls)
                //await wait(1000)
                return port
            } catch (err) {
                if (typeof err.originalError?.message === 'string' &&
                    (err.originalError?.message as unknown as string)
                        .includes('TCP server socket binding failed')) {
                    logger.warn(`failed to start WebSocket server on port: ${port} reattempting on next port`)
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
    private startServer(port: number, tls: boolean, certs?: Certs): void {

        this.port = port
        this.tls = tls

        /*
        port?: number; // default 8080
        enableTls?: boolean; // default = false;
        certificatePemFile?: string;
        keyPemFile?: string;
        keyPemPass?: string;
        bindAddress?: string;
        connectionTimeout?: number; // milliseconds
        maxMessageSize?: number;
        */
        const webSocketServerConfiguration: NodeDataChannel.WebSocketServerConfiguration = {
            port,
            enableTls: tls,
            bindAddress: '0.0.0.0',
            maxMessageSize: this.config.maxMessageSize ?? 1048576
        }

        if (certs) {
            webSocketServerConfiguration.certificatePemFile = certs.cert
            webSocketServerConfiguration.keyPemFile = certs.key
        } else if (this.config.tlsCertificate) {
            webSocketServerConfiguration.certificatePemFile = fs.readFileSync(this.config.tlsCertificate.certFileName).toString()
            webSocketServerConfiguration.keyPemFile = fs.readFileSync(this.config.tlsCertificate.privateKeyFileName).toString()
        } else if (tls) {
            const certificate = createSelfSignedCertificate('streamr-self-signed-' + uuid(), 1000)
            webSocketServerConfiguration.certificatePemFile = certificate.serverCert
            webSocketServerConfiguration.keyPemFile = certificate.serverKey
        }

        try {
            logger.trace('Starting WebSocket server on port ' + port)
            this.wsServer = new NodeDataChannel.WebSocketServer(webSocketServerConfiguration)
        } catch (err) {
            throw (new WebsocketServerStartError('Starting Websocket server failed', err))
        }
        logger.trace('WebSocket server started on port ' + port)
        this.wsServer.onClient((ws: NodeDataChannel.WebSocket) => { 
            if (ws.path() == undefined || ws.remoteAddress() == undefined) {
                
                ws.onOpen(() => {
                    if (ws.path() == undefined || ws.remoteAddress() == undefined) {
                        return 
                    }
                    const parsedUrl = parse(ws.path()!)
                    this.emit('connected', new WebsocketServerConnection(ws, parsedUrl, ws.remoteAddress()!.split(':')[0]))
                })
                ws.onClosed(() => {
                    ws.forceClose()
                })
                ws.onError((error: string) => {
                    logger.trace('WebSocket Client error: ' + error)
                })
            } else {
                const parsedUrl = parse(ws.path()!)
                this.emit('connected', new WebsocketServerConnection(ws, parsedUrl, ws.remoteAddress()!.split(':')[0]))
            }
        })
        /*
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

            this.wsServer = this.createWsServer()
            
            this.wsServer.on('connection', (ws: WebSocket, request: IncomingMessage) => {
                logger.trace(`New connection from ${request.socket.remoteAddress}`)
                if (!originIsAllowed()) {
                    // Make sure we only accept requests from an allowed origin
                    ws.close()
                    logger.trace('IConnection from origin ' + request.headers.origin + ' rejected.')
                    return
                }
                this.emit('connected', new WebsocketServerConnection(ws, parse(request.url!), request.socket.remoteAddress!))
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
        }) */
    }

    private stopServer(): void {
        logger.trace('Stopping WebSocket server')
        this.wsServer?.stop()
    }

    public updateCertificate(cert: string, key: string): void {
        logger.trace('Updating WebSocket server certificate')
        this.stopServer()
        this.startServer(this.port!, this.tls!, { cert, key })
        /*
        (this.httpServer! as HttpsServer).setSecureContext({
            cert,
            key
        })
        */
    }

    public async stop(): Promise<void> {
        logger.trace('WebSocketServet::stop()')
        this.abortController.abort()
        this.removeAllListeners()
        this.stopServer()
        /*
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
        */
    }

    /*
    private createWsServer(): WebSocket.Server {
        const maxPayload = this.config.maxMessageSize ?? 1048576
        return this.wsServer = new WebSocket.Server({
            noServer: true,
            maxPayload
        })
    }

    private startWsServer(certs?: Certs): void {
    
    }*/
}
