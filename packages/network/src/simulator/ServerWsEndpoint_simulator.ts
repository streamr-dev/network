import { Simulator } from './Simulator'
import { PeerId, PeerInfo } from '../connection/PeerInfo'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason, } from "../connection/ws/AbstractWsEndpoint"
import { staticLogger, ServerWsConnection } from './ServerWsConnection_simulator'
import fs from 'fs'
import net from 'net'
import https from 'https'
import http from 'http'
import { once } from 'events'
import { v4 } from 'uuid'
import { AbstractWsConnection } from '../connection/ws/AbstractWsConnection'
import { ISimulatedWsEndpoint } from './ISimulatedWsEndpoint'

type HostPort = {
    hostname: string,
    port: number
}
type UnixSocket = string

export type HttpServerConfig = HostPort | UnixSocket

export class ServerWsEndpoint extends AbstractWsEndpoint<ServerWsConnection> implements ISimulatedWsEndpoint {
    private readonly serverUrl: string
    private readonly httpServer: http.Server | https.Server | null
    private readonly ownAddress: string
    private handshakeListeners: { [fromAddress: string]: { [uuid: string]: (data: string) => Promise<void> } } = {}

    constructor(
        listen: HttpServerConfig,
        sslEnabled: boolean,
        httpServer: http.Server | https.Server | null,
        peerInfo: PeerInfo,
        pingInterval?: number
    ) {
        super(peerInfo, pingInterval)
        this.httpServer = httpServer
        const protocol = sslEnabled ? 'wss' : 'ws'
        if (typeof listen !== "string") {
            this.serverUrl = `${protocol}://${listen.hostname}:${listen.port}`
        } else {
            this.serverUrl = `${protocol}+unix://${listen}`
        }
        this.ownAddress = (listen as HostPort).hostname + ':' + (listen as HostPort).port
        Simulator.instance().addServerWsEndpoint(peerInfo, (listen as HostPort).hostname, (listen as HostPort).port, this)
        //this.wss = this.startWsServer()

    }

    /****************** Called by Simulator ************/

    public handleIncomingConnection(fromAddress: string, _ufromInfo: PeerInfo): void {

        if (!this.handshakeListeners.hasOwnProperty(fromAddress)) {
            this.handshakeListeners[fromAddress] = {}
        }

        const handshakeUUID = v4()

        //let otherNodeIdForLogging = 'unknown (no handshake)'
        this.handshakeListeners[fromAddress][handshakeUUID] = async (data: string) => {
            try {
                const { uuid, peerId } = JSON.parse(data)
                if (uuid === handshakeUUID && peerId) {
                    //otherNodeIdForLogging = peerId
                    this.clearHandshake(uuid)
                    delete this.handshakeListeners[fromAddress][uuid]
                    if (Object.keys(this.handshakeListeners[fromAddress]).length == 0) {
                        delete this.handshakeListeners[fromAddress]
                    }    
                    // Check that a client with the same peerId has not already connected to the server.
                    if (!this.getConnectionByPeerId(peerId)) {
                        this.acceptConnection(peerId, fromAddress)
                    } else {
                        const failedMessage = `Connection for node: ${peerId} has already been established, rejecting duplicate`

                        Simulator.instance().wsDisconnect(this.ownAddress, this.peerInfo, fromAddress, DisconnectionCode.DUPLICATE_SOCKET, 
                            failedMessage)

                        this.logger.warn(failedMessage + " "+data)
                    }
                } else {
                    this.logger.trace('Expected a handshake message got: ' + data.toString())
                }
            } catch (err) {
                this.logger.trace(err)
            }
        }

        this.handshakeTimeoutRefs[handshakeUUID] = setTimeout(() => {
            Simulator.instance().wsDisconnect(this.ownAddress, this.peerInfo, fromAddress, DisconnectionCode.FAILED_HANDSHAKE, 
                `Handshake not received from connection behind UUID ${handshakeUUID}`)

            //ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`)

            this.logger.warn(`Server: Handshake not received from connection behind UUID ${handshakeUUID}`)

            delete this.handshakeTimeoutRefs[handshakeUUID]
        }, this.handshakeTimer)

        Simulator.instance().wsSend(this.ownAddress, this.peerInfo, fromAddress, 
            JSON.stringify({ uuid: handshakeUUID, peerId: this.peerInfo.peerId }))
    }

    public handleIncomingDisconnection(fromAddress: string, fromInfo: PeerInfo, code: DisconnectionCode, reason: DisconnectionReason | string): void {
        if (this.getConnectionByPeerId(fromInfo.peerId)) {
            this.onClose(this.getConnectionByPeerId(fromInfo.peerId) as ServerWsConnection, code, reason as DisconnectionReason)
        }
    }

    public async handleIncomingMessage(fromAddress: string, fromInfo: PeerInfo, data: string): Promise<void> {
        if (data === 'ping') {
            await this.send(fromInfo.peerId, 'pong')
        }

        else if (data === 'pong') {
            const connection = this.getConnectionByPeerId(fromInfo.peerId) as AbstractWsConnection
            connection.onPong()
        }

        else if (this.handshakeListeners.hasOwnProperty(fromAddress) && Object.keys(this.handshakeListeners[fromAddress]).length > 0) {
            try {
                const { uuid, peerId } = JSON.parse(data)

                if (uuid && peerId && this.handshakeListeners[fromAddress].hasOwnProperty(uuid)) {
                    this.handshakeListeners[fromAddress][uuid](data)
                }

                else {
                    const connection = this.getConnectionByPeerId(fromInfo.peerId) as AbstractWsConnection
                    this.onReceive(connection, data.toString())
                }

            } catch (err) {
                const connection = this.getConnectionByPeerId(fromInfo.peerId) as AbstractWsConnection
                this.logger.trace(err)
                this.onReceive(connection, data.toString())
            }
        }
        else {
            const connection = this.getConnectionByPeerId(fromInfo.peerId) as AbstractWsConnection
            this.onReceive(connection, data)
        }
    }

    /****************** Called by Simulator ends *******/

    /*
    private startWsServer(): WebSocket.Server {
        return new WebSocket.Server({
            server: this.httpServer,
            maxPayload: 1024 * 1024
        }).on('error', (err: Error) => {
            this.logger.error('web socket server (wss) emitted error: %s', err)
        }).on('listening', () => {
            this.logger.trace('listening on %s', this.getUrl())
        }).on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
            const handshakeUUID = v4()

            ws.send(JSON.stringify({ uuid: handshakeUUID, peerId: this.peerInfo.peerId }))

            this.handshakeTimeoutRefs[handshakeUUID] = setTimeout(() => {
                ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`)
                this.logger.warn(`Handshake not received from connection behind UUID ${handshakeUUID}`)
                ws.terminate()
                delete this.handshakeTimeoutRefs[handshakeUUID]
            }, this.handshakeTimer)

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
                            this.metrics.record('open:duplicateSocket', 1)
                            const failedMessage = `Connection for node: ${peerId} has already been established, rejecting duplicate`
                            ws.close(DisconnectionCode.DUPLICATE_SOCKET, failedMessage)
                            this.logger.warn(failedMessage)
                        }
                    } else {
                        this.logger.trace('Expected a handshake message got: ' + data.toString())
                    }
                } catch (err) {
                    this.logger.trace(err)
                }
            })

            ws.on('error', (err) => {
                this.logger.warn('socket for "%s" emitted error: %s', otherNodeIdForLogging, err)
            })
        })
    }
    */

    private acceptConnection(peerId: PeerId, remoteAddress: string): void {
        const connection = new ServerWsConnection(this.ownAddress, this.peerInfo, remoteAddress, PeerInfo.newNode(peerId))
        this.onNewConnection(connection)
    }

    getUrl(): string {
        return this.serverUrl
    }

    resolveAddress(peerId: PeerId): string | undefined {
        return this.getConnectionByPeerId(peerId)?.getRemoteAddress()
    }

    protected doClose(_connection: ServerWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void { }

    protected async doStop(): Promise<void> {
        if (this.httpServer) {
            return new Promise((resolve, reject) => {
                this.httpServer?.close((err?) => {
                    if (err) {
                        this.logger.error('error closing http server: %s', err)
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        }
        /*
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
        })*/
    }

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

        staticLogger.info('socket in use, trying to recover: %s', config)
        staticLogger.trace('checking if socket in use by another server')
        const clientSocket = new net.Socket()
        // socket will automatically close on error
        clientSocket.on('error', (err: any) => {
            // rethrow if unexpected error
            if (!err.message.includes('ECONNREFUSED')) {
                throw err
            }

            // No other server listening
            try {
                staticLogger.trace('cleaning unused socket: %s', config)
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
            staticLogger.error('Another server already running on socket: %s', config)
            process.exit(1)
        })
        clientSocket.connect({ path: config })
    })
}

export async function startHttpServer(
    config: HttpServerConfig,
    privateKeyFileName: string | undefined = undefined,
    certFileName: string | undefined = undefined
): Promise<http.Server | https.Server | null> {

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
        staticLogger.info(`listening on %s`, JSON.stringify(config))
    } catch (err) {
        // Kill process if started on host/port, else wait for Unix Socket to be cleaned up
        if (typeof config !== "string") {
            staticLogger.error(err)
            process.exit(1)
        } else {
            await once(httpServer, 'listening')
            staticLogger.info(`listening on %s`, JSON.stringify(config))
        }
    }
    return httpServer

}