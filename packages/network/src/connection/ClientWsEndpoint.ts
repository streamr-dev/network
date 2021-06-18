import { EventEmitter } from 'events'
import { DisconnectionCode, DisconnectionReason, Event, IWsEndpoint } from './IWsEndpoint'
import WebSocket from 'ws'
import { PeerBook } from './PeerBook'
import { PeerInfo, PeerType } from './PeerInfo'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import { Rtts } from '../identifiers'


interface Connection {
    // upgraded vars
    address?: string
    peerId?: string
    peerType?: PeerType
    controlLayerVersions?: string
    messageLayerVersions?: string

    peerInfo: PeerInfo
    highBackPressure: boolean
    respondedPong?: boolean
    rttStart?: number
    rtt?: number
}

interface WsConnection extends WebSocket, Connection {}

const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
const LOW_BACK_PRESSURE = 1024 * 1024
const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin

function closeWs(
    ws: WsConnection,
    code: DisconnectionCode,
    reason: DisconnectionReason,
    logger: Logger
): void {
    try {
        ws.close(code, reason)
    } catch (e) {
        logger.error('failed to close ws, reason: %s', e)
    }
}

function getBufferedAmount(ws: WsConnection): number {
    return ws.bufferedAmount 
}

function terminateWs(ws: WsConnection, logger: Logger): void {
    try {
        ws.terminate()
    } catch (e) {
        logger.error('failed to terminate ws, reason %s', e)
    }
}

function toHeaders(peerInfo: PeerInfo): { [key: string]: string } {
    return {
        'streamr-peer-id': peerInfo.peerId,
        'streamr-peer-type': peerInfo.peerType,
        'control-layer-versions': peerInfo.controlLayerVersions.join(','),
        'message-layer-versions': peerInfo.messageLayerVersions.join(',')
    }
}

export class ClientWsEndpoint extends EventEmitter implements IWsEndpoint {
    private readonly peerInfo: PeerInfo
    private readonly advertisedWsUrl: string | null

    private readonly logger: Logger
    private readonly connections: Map<string, WsConnection>
    private readonly pendingConnections: Map<string, Promise<string>>
    private readonly peerBook: PeerBook
    private readonly pingInterval: NodeJS.Timeout
    private readonly metrics: Metrics

    constructor(
        peerInfo: PeerInfo,
        advertisedWsUrl: string | null,
        metricsContext = new MetricsContext(peerInfo.peerId),
        pingInterval = 5 * 1000
    ) {
        super()

        
        if (!(peerInfo instanceof PeerInfo)) {
            throw new Error('peerInfo not instance of PeerInfo')
        }
        if (advertisedWsUrl === undefined) {
            throw new Error('advertisedWsUrl not given')
        }

        this.peerInfo = peerInfo
        this.advertisedWsUrl = advertisedWsUrl

        this.logger = new Logger(module)
        this.connections = new Map()
        this.pendingConnections = new Map()
        this.peerBook = new PeerBook()

        this.logger.trace('listening on %s', this.getAddress())
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
                this.logger.trace('pinging %s (current rtt %s)', address, ws.rtt)
            } catch (e) {
                this.logger.warn(`failed pinging %s, error %s, terminating connection`, address, e)
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
                this.logger.trace('cannot send to %s [%s], not connected', recipientId, recipientAddress)
                reject(new Error(`cannot send to ${recipientId} [${recipientAddress}] because not connected`))
            } else {
                const ws = this.connections.get(recipientAddress)!
                this.socketSend(ws, message, recipientId, recipientAddress, resolve, reject)
            }
        })
    }

    private socketSend(
        ws: WsConnection,
        message: string,
        recipientId: string,
        recipientAddress: string,
        successCallback: (peerId: string) => void,
        errorCallback: (err: Error) => void
    ): void {
        const onSuccess = (address: string, peerId: string, msg: string): void => {
            this.logger.trace('sent to %s [%s] message "%s"', recipientId, address, msg)
            this.metrics.record('outSpeed', msg.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgOutSpeed', 1)
            successCallback(peerId)
        }

        try {
            ws.send(message, (err) => {
                if (err) {
                    this.metrics.record('sendFailed', 1)
                    errorCallback(err)
                } else {
                    onSuccess(recipientAddress, recipientId, message)
                }
            })
            this.evaluateBackPressure(ws)
        } catch (e) {
            this.metrics.record('sendFailed', 1)
            this.logger.warn('sending to %s [%s] failed, reason %s, readyState is %s',
                recipientId, recipientAddress, e, ws.readyState)
            terminateWs(ws, this.logger)
        }
    }

    private evaluateBackPressure(ws: WsConnection): void {
        const bufferedAmount = getBufferedAmount(ws)
        if (!ws.highBackPressure && bufferedAmount > HIGH_BACK_PRESSURE) {
            this.logger.trace('Back pressure HIGH for %s at %d', ws.peerInfo, bufferedAmount)
            this.emit(Event.HIGH_BACK_PRESSURE, ws.peerInfo)
            ws.highBackPressure = true
        } else if (ws.highBackPressure && bufferedAmount < LOW_BACK_PRESSURE) {
            this.logger.trace('Back pressure LOW for %s at %d', ws.peerInfo, bufferedAmount)
            this.emit(Event.LOW_BACK_PRESSURE, ws.peerInfo)
            ws.highBackPressure = false
        }
    }

    onReceive(peerInfo: PeerInfo, address: string, message: string): void {
        this.logger.trace('<== received from %s [%s] message "%s"', peerInfo, address, message)
        this.emit(Event.MESSAGE_RECEIVED, peerInfo, message)
    }

    close(recipientId: string, reason = DisconnectionReason.GRACEFUL_SHUTDOWN): void {
        const recipientAddress = this.resolveAddress(recipientId)

        this.metrics.record('close', 1)
        if (!this.isConnected(recipientAddress)) {
            this.logger.trace('cannot close connection to %s [%s] because not connected', recipientId, recipientAddress)
        } else {
            const ws = this.connections.get(recipientAddress)!
            try {
                this.logger.trace('closing connection to %s [%s], reason %s', recipientId, recipientAddress, reason)
                closeWs(ws, DisconnectionCode.GRACEFUL_SHUTDOWN, reason, this.logger)
            } catch (e) {
                this.logger.warn('closing connection to %s [%s] failed because of %s', recipientId, recipientAddress, e)
            }
        }
    }

    connect(peerAddress: string): Promise<string> {
        if (this.isConnected(peerAddress)) {
            const ws = this.connections.get(peerAddress)!

            if (ws.readyState === ws.OPEN) {
                this.logger.trace('already connected to %s', peerAddress)
                return Promise.resolve(this.peerBook.getPeerId(peerAddress))
            }

            this.logger.trace('already connected to %s, but readyState is %s, closing connection',
                peerAddress, ws.readyState)
            this.close(this.peerBook.getPeerId(peerAddress))
        }

        if (peerAddress === this.getAddress()) {
            this.metrics.record('open:ownAddress', 1)
            this.logger.warn('not allowed to connect to own address %s', peerAddress)
            return Promise.reject(new Error('trying to connect to own address'))
        }

        if (this.pendingConnections.has(peerAddress)) {
            this.logger.trace('pending connection to %s', peerAddress)
            return this.pendingConnections.get(peerAddress)!
        }

        this.logger.trace('===> connecting to %s', peerAddress)

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
                    const controlLayerVersions = res.headers['control-layer-versions'] as string
                    const messageLayerVersions = res.headers['message-layer-versions'] as string

                    if (peerId && peerType && controlLayerVersions && messageLayerVersions) {
                        const controlLayerVersionsArray = controlLayerVersions.split(',').map((version) => parseInt(version, 10))
                        const messageLayerVersionsArray = messageLayerVersions.split(',').map((version) => parseInt(version, 10))

                        serverPeerInfo = new PeerInfo(peerId, peerType, controlLayerVersionsArray, messageLayerVersionsArray)
                    } else {
                        this.logger.debug('Invalid message headers received on upgrade: ' + res)
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
                    this.logger.trace('failed to connect to %s, error: %o', peerAddress, err)
                    terminateWs(ws, this.logger)
                    reject(err)
                })
            } catch (err) {
                this.metrics.record('open:failedException', 1)
                this.logger.trace('failed to connect to %s, error: %o', peerAddress, err)
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

                

                setTimeout(() => resolve(), 100)
            } catch (e) {
                this.logger.error('error while shutting down uWS server: %s', e)
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
        return this.advertisedWsUrl!
    }

    getPeerInfo(): Readonly<PeerInfo> {
        return this.peerInfo
    }

    getPeers(): ReadonlyMap<string, WsConnection> {
        return this.connections
    }

    getPeerInfos(): PeerInfo[] {
        return Array.from(this.connections.keys())
            .map((address) => this.peerBook.getPeerInfo(address))
            .filter((x) => x !== null) as PeerInfo[]
    }

    resolveAddress(peerId: string): string | never {
        return this.peerBook.getAddress(peerId)
    }

    private onIncomingConnection(ws: WsConnection): void {
        const { address, peerId, peerType, controlLayerVersions, messageLayerVersions } = ws

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
            if (!controlLayerVersions) {
                throw new Error('controlLayerVersions not given')
            }
            if (!messageLayerVersions) {
                throw new Error('messageLayerVersions not given')
            }
            const controlLayerVersionsArray = controlLayerVersions.split(',').map((version) => parseInt(version))
            const messageLayerVersionsArray = messageLayerVersions.split(',').map((version) => parseInt(version))

            const clientPeerInfo = new PeerInfo(peerId, peerType, controlLayerVersionsArray, messageLayerVersionsArray)
            if (this.isConnected(address)) {
                this.metrics.record('open:duplicateSocket', 1)
                ws.close(DisconnectionCode.DUPLICATE_SOCKET, DisconnectionReason.DUPLICATE_SOCKET)
                return
            }

            this.logger.trace('<=== %s connecting to me', address)
            this.onNewConnection(ws, address, clientPeerInfo, false)
        } catch (e) {
            this.logger.trace('dropped incoming connection because of %s', e)
            this.metrics.record('open:missingParameter', 1)
            closeWs(ws, DisconnectionCode.MISSING_REQUIRED_PARAMETER, e.toString(), this.logger)
        }
    }

    private onClose(address: string, peerInfo: PeerInfo, code = 0, reason = ''): void {
        if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
            this.metrics.record('open:duplicateSocket', 1)
            this.logger.trace('socket %s dropped from other side because existing connection already exists')
            return
        }

        this.metrics.record('close', 1)
        this.logger.trace('socket to %s closed (code %d, reason %s)', address, code, reason)
        this.connections.delete(address)
        this.logger.trace('removed %s [%s] from connection list', peerInfo, address)
        this.emit(Event.PEER_DISCONNECTED, peerInfo, reason)
    }

    private onNewConnection(
        ws: WsConnection,
        address: string,
        peerInfo: PeerInfo, out: boolean
    ): boolean {
        // Handle scenario where two peers have opened a socket to each other at the same time.
        // Second condition is a tiebreaker to avoid both peers of simultaneously disconnecting their socket,
        // thereby leaving no connection behind.
        if (this.isConnected(address) && this.getAddress().localeCompare(address) === 1) {
            this.metrics.record('open:duplicateSocket', 1)
            this.logger.trace('dropped new connection with %s because an existing connection already exists', address)
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
        this.logger.trace('added %s [%s] to connection list', peerInfo, address)
        this.logger.trace('%s connected to %s', out ? '===>' : '<===', address)
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
            this.logger.trace(`=> got pong event ws ${address}`)
            ws.respondedPong = true
            ws.rtt = Date.now() - ws.rttStart!
        })

        ws.once('close', (code: number, reason: string): void => {
            if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
                this.metrics.record('open:duplicateSocket', 1)
                this.logger.trace('socket %s dropped from other side because existing connection already exists')
                return
            }

            this.onClose(address, this.peerBook.getPeerInfo(address)!, code, reason)
        })
    }
}

// made it async to match the startEndpoint method on WsServer
export async function startClientWsEndpoint(
    peerInfo: PeerInfo,
    advertisedWsUrl?: string | null,
    metricsContext?: MetricsContext,
    pingInterval?: number | undefined
): Promise<ClientWsEndpoint> {
    return new ClientWsEndpoint(peerInfo, advertisedWsUrl!, metricsContext, pingInterval)
}