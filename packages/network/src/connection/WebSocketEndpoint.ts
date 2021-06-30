import { EventEmitter } from 'events'
import { DisconnectionCode, DisconnectionReason, Event, IWsEndpoint } from './IWsEndpoint'
import uWS from 'uWebSockets.js'
import WebSocket from 'ws'
import { PeerBook } from './PeerBook'
import { PeerInfo, PeerType } from './PeerInfo'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { Logger } from '../helpers/Logger'
import { Rtts } from '../identifiers'
import { ConstructorOptions, WebSocketConnection } from './WebSocketConnection'
import { UWsServer } from './UWsServer'
import { ClientWebSocketConnection } from './ClientWebSocketConnection'
import { DeferredConnectionAttempt } from './DeferredConnectionAttempt'


export interface ClientWebSocketConnectionFactory {
    createConnection(opts: ConstructorOptions): ClientWebSocketConnection
}

const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
const LOW_BACK_PRESSURE = 1024 * 1024
const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin



export class WebSocketEndpoint extends EventEmitter implements IWsEndpoint {
    private stopped = false
    private readonly serverHost: string
    private readonly serverPort: number
    private readonly privateKeyFileName: string | undefined
    private readonly certFileName: string | undefined
    private readonly peerInfo: PeerInfo
    private readonly advertisedWsUrl: string | null
    private readonly connectionFactory: ClientWebSocketConnectionFactory
    private readonly logger: Logger
    private readonly connections: { [peerAddress: string]: WebSocketConnection }

    private readonly peerBook: PeerBook
    private readonly metrics: Metrics

    private uwsServer: UWsServer | null

    constructor(
        host: string,
        port: number,
        privateKeyFileName: string | undefined,
        certFileName: string | undefined,
        connectionFactory: ClientWebSocketConnectionFactory,
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

        this.serverHost = host
        this.serverPort = port
        this.peerInfo = peerInfo
        this.advertisedWsUrl = advertisedWsUrl
        this.privateKeyFileName = privateKeyFileName
        this.certFileName = certFileName
        this.connectionFactory = connectionFactory

        this.logger = new Logger(module)
        this.connections = {}

        this.peerBook = new PeerBook()

        this.uwsServer = new UWsServer(this.peerInfo,
            this.getAddress(),
            this.serverHost,
            this.serverPort,
            this.privateKeyFileName,
            this.certFileName,
            WS_BUFFER_SIZE)

        this.uwsServer.on('newConnection', (connection) => {
            // the connection is already open, so no open event handler needed
            this.connections[connection.getPeerAddress()] = connection
            this.setListenersToConnection(connection)
            this.onNewConnection(connection, false)
        })

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
            .addQueriedMetric('connections', () => Object.keys(this.connections).length)
            .addQueriedMetric('rtts', () => this.getRtts())
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return Object.values(this.connections)
                    .reduce((totalBufferSizeSum, ws) => totalBufferSizeSum + ws.getBufferedAmount(), 0)
            })
    }

    async start(): Promise<void> {
        if (this.uwsServer) {
            await this.uwsServer.start()
        }
    }

    private setListenersToConnection(connection: WebSocketConnection) {
        connection.on('message', (message) => {
            this.metrics.record('inSpeed', message.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgInSpeed', 1)
            this.emit(Event.MESSAGE_RECEIVED, connection.getPeerInfo(), message)
        })
        connection.once('close', (code, reason) => {

            if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
                this.metrics.record('open:duplicateSocket', 1)
                this.logger.trace('socket %s dropped from other side because existing connection already exists')
                return
            }

            this.logger.trace('socket to %s closed (code %d, reason %s)', connection.getPeerAddress(), code, reason)

            if (this.connections[connection.getPeerAddress()] === connection) {
                // if endpoint.close() was called, connection has already been
                // removed and possibly replaced. This check avoids deleting new
                // connection.
                delete this.connections[connection.getPeerAddress()]
            }

            this.logger.trace('removed %s [%s] from connection list', connection.getPeerInfo(), connection.getPeerAddress())
            this.emit(Event.PEER_DISCONNECTED, connection.getPeerInfo(), reason)

            connection.removeAllListeners()
            this.metrics.record('close', 1)
        })
        connection.on('lowBackPressure', () => {
            this.emit(Event.LOW_BACK_PRESSURE, connection.getPeerInfo())
        })
        connection.on('highBackPressure', () => {
            this.emit(Event.HIGH_BACK_PRESSURE, connection.getPeerInfo())
        })
        connection.on('error', (err) => {
            this.metrics.record('webSocketError', 1)
            this.logger.trace('websocket connection error with %s, error: %o', connection.getPeerInfo(), err)
            connection.close(DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)
        })

        return connection
    }

    send(recipientId: string, message: string): Promise<string> {
        const recipientAddress = this.resolveAddress(recipientId)
        return new Promise<string>((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                this.metrics.record('sendFailed', 1)
                this.logger.trace('cannot send to %s [%s], not connected', recipientId, recipientAddress)
                reject(new Error(`cannot send to ${recipientId} [${recipientAddress}] because not connected`))
            } else {
                const ws = this.connections[recipientAddress]!
                try {
                    ws.send(message).then(() => {
                        this.logger.trace('sent to %s [%s] message "%s"', recipientId, recipientAddress, message)
                        this.metrics.record('outSpeed', message.length)
                        this.metrics.record('msgSpeed', 1)
                        this.metrics.record('msgOutSpeed', 1)
                        resolve(ws.getPeerId())
                    }).catch(err => {
                        this.metrics.record('sendFailed', 1)
                        ws.close(DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)
                        reject(err)
                    })
                } catch (e) {
                    this.metrics.record('sendFailed', 1)
                    this.logger.warn('sending to %s [%s] failed, reason %s, readyState is %s',
                        recipientId, recipientAddress, e, ws.getReadyState())
                    ws.close(DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)
                    reject(e)
                }
            }
        })
    }

    close(recipientId: string, reason = DisconnectionReason.GRACEFUL_SHUTDOWN): void {
        const recipientAddress = this.resolveAddress(recipientId)

        this.metrics.record('close', 1)
        if (!this.isConnected(recipientAddress)) {
            this.logger.trace('cannot close connection to %s [%s] because not connected', recipientId, recipientAddress)
        } else {
            const ws = this.connections[recipientAddress]!
            try {
                this.logger.trace('closing connection to %s [%s], reason %s', recipientId, recipientAddress, reason)
                ws.close(DisconnectionCode.GRACEFUL_SHUTDOWN, reason)
            } catch (e) {
                this.logger.warn('closing connection to %s [%s] failed because of %s', recipientId, recipientAddress, e)
            }
        }
    }

    private createClientConnection(targetAddress: string, deferredConnectionAttempt: DeferredConnectionAttempt): ClientWebSocketConnection {
        const connection = this.connectionFactory.createConnection({
            selfAddress: this.getAddress(),
            selfPeerInfo: this.peerInfo,
            targetPeerAddress: targetAddress,
            deferredConnectionAttempt: deferredConnectionAttempt
        })
        this.setListenersToConnection(connection)
        connection.once('open', () => {
            this.onNewConnection(connection, true)
        })

        return connection
    }

    connect(peerAddress: string): Promise<string> {

        if (this.stopped) {
            return Promise.reject(new Error('WebSocketEndpoint has been stopped'))
        }

        // connection exists in some state already

        if (this.connections[peerAddress]) {
            const connection = this.connections[peerAddress]
            const deferredConnectionAttempt = connection.getDeferredConnectionAttempt()

            if (connection.isOpen()) {
                this.logger.trace('already connected to %s', peerAddress)
                return Promise.resolve(this.peerBook.getPeerId(peerAddress))
            } else if (deferredConnectionAttempt) {
                return deferredConnectionAttempt.getPromise()
            } else {
                throw new Error(`unexpected deferedConnectionAttempt == null ${connection.getPeerId()}`)
            }
        }

        // connection does not exist, need to create a new one

        if (peerAddress === this.getAddress()) {
            this.metrics.record('open:ownAddress', 1)
            this.logger.warn('not allowed to connect to own address %s', peerAddress)
            return Promise.reject(new Error('trying to connect to own address'))
        }

        this.logger.trace('===> connecting to %s', peerAddress)

        const connection = this.createClientConnection(peerAddress, new DeferredConnectionAttempt())

        this.connections[peerAddress] = connection
        connection.connect()

        const deferredAttempt = connection.getDeferredConnectionAttempt()
        if (deferredAttempt) {
            return deferredAttempt.getPromise()
        } else {
            throw new Error(`disconnected ${connection.getPeerId()}`)
        }
    }

    stop(): Promise<void> {
        this.stopped = true
        return new Promise<void>((resolve, reject) => {
            try {
                Object.values(this.connections).forEach((connection) => connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN))

                if (this.uwsServer) {
                    this.logger.trace('shutting down uWS server')
                    this.uwsServer.stop()
                    this.uwsServer = null
                }

                setTimeout(() => resolve(), 100)
            } catch (e) {
                this.logger.error('error while shutting down uWS server: %s', e)
                reject(new Error(`Failed to stop websocket server, because of ${e}`))
            }
        })
    }

    isConnected(address: string): boolean {
        return this.connections.hasOwnProperty(address)
    }

    getRtts(): Readonly<Rtts> {
        const rtts: Rtts = {}
        Object.entries(this.connections).forEach(([targetPeerId, connection]) => {
            const rtt = connection.getRtt()
            if (rtt !== undefined && rtt !== null) {
                rtts[targetPeerId] = rtt
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


    getPeerInfo(): Readonly<PeerInfo> {
        return this.peerInfo
    }

    getPeerInfos(): PeerInfo[] {
        return Object.keys(this.connections)
            .map((address) => this.peerBook.getPeerInfo(address))
            .filter((x) => x !== null) as PeerInfo[]
    }

    resolveAddress(peerId: string): string | never {
        return this.peerBook.getAddress(peerId)
    }

    getWss(): uWS.TemplatedApp {
		return this.uwsServer?.getWss()!
	}


    private onNewConnection(
        ws: WebSocketConnection,
        out: boolean
    ): boolean {
        // Handle scenario where two peers have opened a socket to each other at the same time.
        // Second condition is a tiebreaker to avoid both peers of simultaneously disconnecting their socket,
        // thereby leaving no connection behind.
        if ((this.isConnected(ws.getPeerAddress()) && this.getAddress().localeCompare(ws.getPeerAddress()) === 1)) {
            this.metrics.record('open:duplicateSocket', 1)
            this.logger.trace('dropped new connection with %s because an existing connection already exists', ws.getPeerAddress())
            ws.close(DisconnectionCode.DUPLICATE_SOCKET, DisconnectionReason.DUPLICATE_SOCKET)
            return false
        }

        this.peerBook.add(ws.getPeerAddress(), ws.getPeerInfo()!)
        this.metrics.record('open', 1)
        this.logger.trace('added %s [%s] to connection list', ws.getPeerInfo(), ws.getPeerAddress())
        this.logger.trace('%s connected to %s', out ? '===>' : '<===', ws.getPeerAddress())
        this.emit(Event.PEER_CONNECTED, ws.getPeerInfo())

        return true
    }

}



export async function startEndpoint(
    host: string,
    port: number,
    peerInfo: PeerInfo,
    advertisedWsUrl: string | null,
    connectionFactory: ClientWebSocketConnectionFactory,
    metricsContext?: MetricsContext,
    pingInterval?: number | undefined,
    privateKeyFileName?: string | undefined,
    certFileName?: string | undefined,
): Promise<WebSocketEndpoint> {

    const endpoint = new WebSocketEndpoint(host, port, privateKeyFileName, certFileName, connectionFactory, peerInfo, advertisedWsUrl, metricsContext, pingInterval)
    await endpoint.start()
    return endpoint
}