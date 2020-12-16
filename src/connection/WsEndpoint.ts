import { EventEmitter } from "events"
import uWS from "uWebSockets.js"
import WebSocket from "ws";
import { PeerBook } from "./PeerBook"
import {PeerInfo, PeerType} from "./PeerInfo"
import { Metrics, MetricsContext } from "../helpers/MetricsContext"
import getLogger from "../helpers/logger"
import pino from "pino"
import { Rtts } from "../identifiers"

const extraLogger = getLogger('streamr:ws-endpoint')

export enum Event {
    PEER_CONNECTED = 'streamr:peer:connect',
    PEER_DISCONNECTED = 'streamr:peer:disconnect',
    MESSAGE_RECEIVED = 'streamr:message-received',
    HIGH_BACK_PRESSURE = 'streamr:high-back-pressure',
    LOW_BACK_PRESSURE = 'streamr:low-back-pressure'
}

export enum DisconnectionCode {
    GRACEFUL_SHUTDOWN = 1000,
    DUPLICATE_SOCKET = 1002,
    NO_SHARED_STREAMS = 1000,
    MISSING_REQUIRED_PARAMETER = 1002,
    DEAD_CONNECTION = 1002
}

export enum DisconnectionReason {
    GRACEFUL_SHUTDOWN = 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET = 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAMS = 'streamr:node:no-shared-streams',
    MISSING_REQUIRED_PARAMETER = 'streamr:node:missing-required-parameter',
    DEAD_CONNECTION = 'streamr:endpoint:dead-connection'
}

interface Connection {
    // upgraded vars
    address?: string
    peerId?: string
    peerType?: PeerType

    peerInfo: PeerInfo
    highBackPressure: boolean
    respondedPong?: boolean
    rttStart?: number
    rtt?: number
}

interface WsConnection extends WebSocket, Connection {}

interface UWSConnection extends uWS.WebSocket, Connection {}

const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
const LOW_BACK_PRESSURE = 1024 * 1024
const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin

function ab2str (buf: ArrayBuffer | SharedArrayBuffer): string {
    return Buffer.from(buf).toString('utf8')
}

function isWSLibrarySocket(ws: WsConnection | UWSConnection): ws is WsConnection {
    return (ws as WsConnection).terminate !== undefined
}

function closeWs(
    ws: WsConnection | UWSConnection,
    code: DisconnectionCode,
    reason: DisconnectionReason,
    logger: pino.Logger
): void {
    try {
        if (isWSLibrarySocket(ws)) {
            ws.close(code, reason)
        } else {
            ws.end(code, reason)
        }
    } catch (e) {
        logger.error(`Failed to close ws, error: ${e}`)
    }
}

function getBufferedAmount(ws: WsConnection | UWSConnection): number {
    return isWSLibrarySocket(ws) ? ws.bufferedAmount : ws.getBufferedAmount()
}

function terminateWs(ws: WsConnection | UWSConnection, logger: pino.Logger): void {
    try {
        if (isWSLibrarySocket(ws)) {
            ws.terminate()
        } else {
            ws.close()
        }
    } catch (e) {
        logger.error(`Failed to terminate ws, error: ${e}`)
    }
}

function toHeaders(peerInfo: PeerInfo): { [key: string]: string } {
    return {
        'streamr-peer-id': peerInfo.peerId,
        'streamr-peer-type': peerInfo.peerType
    }
}

// Declare event handlers
export declare interface WsEndpoint {
    on(event: Event.PEER_CONNECTED, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.PEER_DISCONNECTED, listener: (peerInfo: PeerInfo, reason: string) => void): this
    on(event: Event.MESSAGE_RECEIVED, listener: (peerInfo: PeerInfo, message: string) => void): this
    on(event: Event.HIGH_BACK_PRESSURE, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.LOW_BACK_PRESSURE, listener: (peerInfo: PeerInfo) => void): this
}

export class WsEndpoint extends EventEmitter {
    private readonly serverHost: string
    private readonly serverPort: number
    private readonly wss: uWS.TemplatedApp
    private listenSocket: any
    private readonly peerInfo: PeerInfo
    private readonly advertisedWsUrl: string | null

    private readonly logger: pino.Logger
    private readonly connections: Map<string, WsConnection | UWSConnection>
    private readonly pendingConnections: Map<string, Promise<string>>
    private readonly peerBook: PeerBook
    private readonly pingInterval: NodeJS.Timeout
    private readonly metrics: Metrics

    constructor(
        host: string,
        port: number,
        wss: uWS.TemplatedApp,
        listenSocket: any,
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

        this.logger = getLogger(`streamr:connection:ws-endpoint:${peerInfo.peerId}`)
        this.connections = new Map()
        this.pendingConnections = new Map()
        this.peerBook = new PeerBook()

        this.wss.ws('/ws', {
            compression: 0,
            maxPayloadLength: 1024 * 1024,
            maxBackpressure: WS_BUFFER_SIZE,
            idleTimeout: 0,
            upgrade: (res, req, context) => {
                res.writeStatus('101 Switching Protocols')
                    .writeHeader('streamr-peer-id', this.peerInfo.peerId)
                    .writeHeader('streamr-peer-type', this.peerInfo.peerType)

                /* This immediately calls open handler, you must not use res after this call */
                res.upgrade({
                        // @ts-ignore TODO: type definition mismatch, update uws?
                    address: req.getQuery('address'),
                    peerId: req.getHeader('streamr-peer-id'),
                    peerType: req.getHeader('streamr-peer-type'),
                },
                /* Spell these correctly */
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context)
            },
            open: (ws) => {
                this.onIncomingConnection(ws as UWSConnection)
            },
            message: (ws, message, isBinary) => {
                const connection = this.connections.get(ws.address)

                if (connection) {
                    this.onReceive(ws.peerInfo, ws.address, ab2str(message))
                }
            },
            drain: (ws) => {
                this.evaluateBackPressure(ws as UWSConnection)
            },
            close: (ws, code, message) => {
                const reason = ab2str(message)

                const connection = this.connections.get(ws.address)

                if (connection) {
                    // added 'close' event for test - duplicate-connections-are-closed.test.js
                    this.emit('close', ws, code, reason)
                    this.onClose(ws.address, this.peerBook.getPeerInfo(ws.address)!, code, reason)
                }
            },
            pong: (ws) => {
                const connection = this.connections.get(ws.address)

                if (connection) {
                    this.logger.debug(`<== received from ${ws.address} "pong" frame`)
                    connection.respondedPong = true
                    connection.rtt = Date.now() - connection.rttStart!
                }
            }
        })

        this.logger.debug('listening on: %s', this.getAddress())
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
            .addQueriedMetric('connections', () => this.connections.size)
            .addQueriedMetric('pendingConnections', () => this.pendingConnections.size)
            .addQueriedMetric('rtts', () => this.getRtts())
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return [...this.connections.values()]
                    .reduce((totalBufferSizeSum, ws) => totalBufferSizeSum + getBufferedAmount(ws), 0)
            })
    }

    private pingConnections(): void {
        const addresses = [...this.connections.keys()]
        addresses.forEach((address) => {
            const ws = this.connections.get(address)!

            try {
                // didn't get "pong" in pingInterval
                if (ws.respondedPong !== undefined && !ws.respondedPong) {
                    throw new Error('ws is not active')
                }

                // eslint-disable-next-line no-param-reassign
                ws.respondedPong = false
                ws.rttStart = Date.now()
                ws.ping()
                this.logger.debug(`pinging ${address}, current rtt ${ws.rtt}`)
            } catch (e) {
                this.logger.error(`Failed to ping connection: ${address}, error ${e}, terminating connection`)
                terminateWs(ws, this.logger)
                this.onClose(
                    address,
                    this.peerBook.getPeerInfo(address)!,
                    DisconnectionCode.DEAD_CONNECTION,
                    DisconnectionReason.DEAD_CONNECTION
                )
            }
        })
    }

    send(recipientId: string, message: string): Promise<string> {
        const recipientAddress = this.resolveAddress(recipientId)
        return new Promise<string>((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                this.metrics.record('sendFailed', 1)
                this.logger.debug('cannot send to %s [%s] because not connected', recipientId, recipientAddress)
                reject(new Error(`cannot send to ${recipientId} [${recipientAddress}] because not connected`))
            } else {
                const ws = this.connections.get(recipientAddress)!
                this.socketSend(ws, message, recipientId, recipientAddress, resolve, reject)
            }
        })
    }

    private socketSend(
        ws: WsConnection | UWSConnection,
        message: string,
        recipientId: string,
        recipientAddress: string,
        successCallback: (peerId: string) => void,
        errorCallback: (err: Error) => void
    ): void {
        const onSuccess = (address: string, peerId: string, msg: string): void => {
            this.logger.debug('sent to %s [%s] message "%s"', recipientId, address, msg)
            this.metrics.record('outSpeed', msg.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgOutSpeed', 1)
            successCallback(peerId)
        }

        try {
            if (!isWSLibrarySocket(ws)) {
                ws.send(message)
                onSuccess(recipientAddress, recipientId, message)
            } else {
                ws.send(message, (err) => {
                    if (err) {
                        this.metrics.record('sendFailed', 1)
                        errorCallback(err)
                    } else {
                        onSuccess(recipientAddress, recipientId, message)
                    }
                })
            }
            this.evaluateBackPressure(ws)
        } catch (e) {
            this.metrics.record('sendFailed', 1)
            this.logger.error('sending to %s [%s] failed because of %s, readyState is',
                recipientId, recipientAddress, e, ws.readyState)
            terminateWs(ws, this.logger)
        }
    }

    private evaluateBackPressure(ws: WsConnection | UWSConnection): void {
        const bufferedAmount = getBufferedAmount(ws)
        if (!ws.highBackPressure && bufferedAmount > HIGH_BACK_PRESSURE) {
            this.logger.debug('Back pressure HIGH for %s at %d', ws.peerInfo, bufferedAmount)
            this.emit(Event.HIGH_BACK_PRESSURE, ws.peerInfo)
            ws.highBackPressure = true
        } else if (ws.highBackPressure && bufferedAmount < LOW_BACK_PRESSURE) {
            this.logger.debug('Back pressure LOW for %s at %d', ws.peerInfo, bufferedAmount)
            this.emit(Event.LOW_BACK_PRESSURE, ws.peerInfo)
            ws.highBackPressure = false
        }
    }

    onReceive(peerInfo: PeerInfo, address: string, message: string): void {
        this.logger.debug('<=== received from %s [%s] message "%s"', peerInfo, address, message)
        this.emit(Event.MESSAGE_RECEIVED, peerInfo, message)
    }

    close(recipientId: string, reason = DisconnectionReason.GRACEFUL_SHUTDOWN): void {
        const recipientAddress = this.resolveAddress(recipientId)

        this.metrics.record('close', 1)
        if (!this.isConnected(recipientAddress)) {
            this.logger.debug('cannot close connection to %s [%s] because not connected', recipientId, recipientAddress)
        } else {
            const ws = this.connections.get(recipientAddress)!
            try {
                this.logger.debug('closing connection to %s [%s], reason %s', recipientId, recipientAddress, reason)
                closeWs(ws, DisconnectionCode.GRACEFUL_SHUTDOWN, reason, this.logger)
            } catch (e) {
                this.logger.error('closing connection to %s [%s] failed because of %s', recipientId, recipientAddress, e)
            }
        }
    }

    connect(peerAddress: string): Promise<string> {
        if (this.isConnected(peerAddress)) {
            const ws = this.connections.get(peerAddress)!

            if (ws.readyState === ws.OPEN) {
                this.logger.debug('already connected to %s', peerAddress)
                return Promise.resolve(this.peerBook.getPeerId(peerAddress))
            }

            this.logger.debug(`already connected but readyState is ${ws.readyState}, closing connection`)
            this.close(this.peerBook.getPeerId(peerAddress))
        }

        if (peerAddress === this.getAddress()) {
            this.metrics.record('open:ownAddress', 1)
            this.logger.debug('not allowed to connect to own address %s', peerAddress)
            return Promise.reject(new Error('trying to connect to own address'))
        }

        if (this.pendingConnections.has(peerAddress)) {
            this.logger.debug('pending connection to %s', peerAddress)
            return this.pendingConnections.get(peerAddress)!
        }

        this.logger.debug('===> connecting to %s', peerAddress)

        const p = new Promise<string>((resolve, reject) => {
            try {
                let serverPeerInfo: PeerInfo
                const ws = new WebSocket(
                    `${peerAddress}/ws?address=${this.getAddress()}`,
                    {
                        headers: toHeaders(this.peerInfo)
                    }
                ) as WsConnection

                ws.on('upgrade', (res) => {
                    const peerId = res.headers['streamr-peer-id'] as string
                    const peerType = res.headers['streamr-peer-type'] as PeerType

                    if (peerId && peerType) {
                        serverPeerInfo = new PeerInfo(peerId, peerType)
                    }
                })

                ws.once('open', () => {
                    if (!serverPeerInfo) {
                        terminateWs(ws, this.logger)
                        this.metrics.record('open:headersNotReceived', 1)
                        reject(new Error('dropping outgoing connection because connection headers never received'))
                    } else {
                        this.addListeners(ws, peerAddress, serverPeerInfo)
                        const result = this.onNewConnection(ws, peerAddress, serverPeerInfo, true)
                        if (result) {
                            resolve(this.peerBook.getPeerId(peerAddress))
                        } else {
                            reject(new Error(`duplicate connection to ${peerAddress} is dropped`))
                        }
                    }
                })

                ws.on('error', (err) => {
                    this.metrics.record('webSocketError', 1)
                    this.logger.debug('failed to connect to %s, error: %o', peerAddress, err)
                    terminateWs(ws, this.logger)
                    reject(err)
                })
            } catch (err) {
                this.metrics.record('open:failedException', 1)
                this.logger.debug('failed to connect to %s, error: %o', peerAddress, err)
                reject(err)
            }
        }).finally(() => {
            this.pendingConnections.delete(peerAddress)
        })

        this.pendingConnections.set(peerAddress, p)
        return p
    }

    stop(): Promise<void> {
        clearInterval(this.pingInterval)

        return new Promise<void>((resolve, reject) => {
            try {
                this.connections.forEach((ws) => {
                    closeWs(ws, DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN, this.logger)
                })

                if (this.listenSocket) {
                    this.logger.debug('shutting down uWS server')
                    uWS.us_listen_socket_close(this.listenSocket)
                    this.listenSocket = null
                }

                setTimeout(() => resolve(), 100)
            } catch (e) {
                this.logger.error(e)
                reject(new Error(`Failed to stop websocket server, because of ${e}`))
            }
        })
    }

    isConnected(address: string): boolean {
        return this.connections.has(address)
    }

    getRtts(): Rtts {
        const connections = [...this.connections.keys()]
        const rtts: Rtts = {}
        connections.forEach((address) => {
            const { rtt } = this.connections.get(address)!
            const nodeId = this.peerBook.getPeerId(address)
            if (rtt !== undefined && rtt !== null) {
                rtts[nodeId] = rtt
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

    getPeers(): ReadonlyMap<string, WsConnection | UWSConnection> {
        return this.connections
    }

    resolveAddress(peerId: string): string | never {
        return this.peerBook.getAddress(peerId)
    }

    private onIncomingConnection(ws: WsConnection | UWSConnection): void {
        const { address, peerId, peerType } = ws

        try {
            if (!address) {
                throw new Error('address not given')
            }
            if (!peerId) {
                throw new Error('peerId not given')
            }
            if (!peerType) {
                throw new Error('peerType not given')
            }

            const clientPeerInfo = new PeerInfo(peerId, peerType)
            if (this.isConnected(address)) {
                this.metrics.record('open:duplicateSocket', 1)
                ws.close(DisconnectionCode.DUPLICATE_SOCKET, DisconnectionReason.DUPLICATE_SOCKET)
                return
            }

            this.logger.debug('<=== %s connecting to me', address)
            // added 'connection' event for test - duplicate-connections-are-closed.test.js
            this.emit('connection', ws)
            this.onNewConnection(ws, address, clientPeerInfo, false)
        } catch (e) {
            this.logger.debug('dropped incoming connection because of %s', e)
            this.metrics.record('open:missingParameter', 1)
            closeWs(ws, DisconnectionCode.MISSING_REQUIRED_PARAMETER, e.toString(), this.logger)
        }
    }

    private onClose(address: string, peerInfo: PeerInfo, code = 0, reason = ''): void {
        if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
            this.metrics.record('open:duplicateSocket', 1)
            this.logger.debug('socket %s dropped from other side because existing connection already exists')
            return
        }

        this.metrics.record('close', 1)
        this.logger.debug('socket to %s closed (code %d, reason %s)', address, code, reason)
        this.connections.delete(address)
        this.logger.debug('removed %s [%s] from connection list', peerInfo, address)
        this.emit(Event.PEER_DISCONNECTED, peerInfo, reason)
    }

    private onNewConnection(
        ws: WsConnection | UWSConnection,
        address: string,
        peerInfo: PeerInfo, out: boolean
    ): boolean {
        // Handle scenario where two peers have opened a socket to each other at the same time.
        // Second condition is a tiebreaker to avoid both peers of simultaneously disconnecting their socket,
        // thereby leaving no connection behind.
        if (this.isConnected(address) && this.getAddress().localeCompare(address) === 1) {
            this.metrics.record('open:duplicateSocket', 1)
            this.logger.debug('dropped new connection with %s because an existing connection already exists', address)
            closeWs(ws, DisconnectionCode.DUPLICATE_SOCKET, DisconnectionReason.DUPLICATE_SOCKET, this.logger)
            return false
        }

        // eslint-disable-next-line no-param-reassign
        ws.peerInfo = peerInfo
        // eslint-disable-next-line no-param-reassign
        ws.address = address
        this.peerBook.add(address, peerInfo)
        this.connections.set(address, ws)
        this.metrics.record('open', 1)
        this.logger.debug('added %s [%s] to connection list', peerInfo, address)
        this.logger.debug('%s connected to %s', out ? '===>' : '<===', address)
        this.emit(Event.PEER_CONNECTED, peerInfo)

        return true
    }

    private addListeners(ws: WsConnection, address: string, peerInfo: PeerInfo): void {
        ws.on('message', (message: string | Buffer | Buffer[]) => {
            // TODO check message.type [utf8|binary]
            this.metrics.record('inSpeed', message.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgInSpeed', 1)

            // toString() needed for SSL connections as message will be Buffer instead of String
            setImmediate(() => this.onReceive(peerInfo, address, message.toString()))
        })

        ws.on('pong', () => {
            this.logger.debug(`=> got pong event ws ${address}`)
            ws.respondedPong = true
            ws.rtt = Date.now() - ws.rttStart!
        })

        ws.once('close', (code: number, reason: string): void => {
            if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
                this.metrics.record('open:duplicateSocket', 1)
                this.logger.debug('socket %s dropped from other side because existing connection already exists')
                return
            }

            this.onClose(address, this.peerBook.getPeerInfo(address)!, code, reason)
        })
    }
}

export function startWebSocketServer(
    host: string,
    port: number,
    privateKeyFileName: string | undefined = undefined,
    certFileName: string | undefined = undefined
): Promise<[uWS.TemplatedApp, any]> {
    return new Promise((resolve, reject) => {
        let server: uWS.TemplatedApp
        if (privateKeyFileName && certFileName) {
            extraLogger.debug(`starting SSL uWS server (host: ${host}, port: ${port}, using ${privateKeyFileName}, ${certFileName}`)
            server = uWS.SSLApp({
                key_file_name: privateKeyFileName,
                cert_file_name: certFileName,
            })
        } else {
            extraLogger.debug(`starting non-SSL uWS (host: ${host}, port: ${port}`)
            server = uWS.App()
        }

        const cb = (listenSocket: any): void => {
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

export async function startEndpoint(
    host: string,
    port: number,
    peerInfo: PeerInfo,
    advertisedWsUrl: string | null,
    metricsContext: MetricsContext,
    pingInterval?: number | undefined,
    privateKeyFileName?: string | undefined,
    certFileName?: string | undefined,
): Promise<WsEndpoint> {
    return startWebSocketServer(host, port, privateKeyFileName, certFileName).then(([wss, listenSocket]) => {
        return new WsEndpoint(host, port, wss, listenSocket, peerInfo, advertisedWsUrl, metricsContext, pingInterval)
    })
}