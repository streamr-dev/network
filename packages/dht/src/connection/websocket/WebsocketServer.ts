import EventEmitter from 'eventemitter3'
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

export class WebsocketServer extends EventEmitter<ConnectionSourceEvents> {

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
                this.startServer(port, this.config.enableTls)               
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

        const webSocketServerConfiguration: NodeDataChannel.WebSocketServerConfiguration = {
            port,
            enableTls: false,
            bindAddress: '0.0.0.0',
            maxMessageSize: this.config.maxMessageSize ?? 1048576
        }

        if (certs || this.config.tlsCertificate || tls) {
            webSocketServerConfiguration.enableTls = true
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
    }

    private stopServer(): void {
        logger.trace('Stopping WebSocket server')
        this.wsServer?.stop()
    }

    public updateCertificate(cert: string, key: string): void {
        logger.trace('Updating WebSocket server certificate')
        this.stopServer()
        this.startServer(this.port!, this.tls!, { cert, key })
    }

    public async stop(): Promise<void> {
        logger.trace('WebSocketServet::stop()')
        this.abortController.abort()
        this.removeAllListeners()
        this.stopServer()
    }
}
