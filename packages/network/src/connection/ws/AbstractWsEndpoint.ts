import { EventEmitter } from "events"
import { Logger } from "../../helpers/Logger"
import { PeerInfo } from "../PeerInfo"
import { Metrics, MetricsContext } from "../../helpers/MetricsContext"
import { Rtts } from "../../identifiers"
import { PingPongWs } from "./PingPongWs"

export const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
export const LOW_BACK_PRESSURE = 1024 * 1024

export enum Event {
    PEER_CONNECTED = 'streamr:peer:connect',
    PEER_DISCONNECTED = 'streamr:peer:disconnect',
    MESSAGE_RECEIVED = 'streamr:message-received',
    HIGH_BACK_PRESSURE = 'streamr:high-back-pressure',
    LOW_BACK_PRESSURE = 'streamr:low-back-pressure'
}

export enum DisconnectionCode {
    GRACEFUL_SHUTDOWN = 1000,
    MISSING_REQUIRED_PARAMETER = 1002,
    DEAD_CONNECTION = 1003,
}

export enum DisconnectionReason {
    GRACEFUL_SHUTDOWN = 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET = 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAMS = 'streamr:node:no-shared-streams',
    DEAD_CONNECTION = 'streamr:endpoint:dead-connection'
}

export class UnknownPeerError extends Error {
    static CODE = 'UnknownPeerError'
    readonly code = UnknownPeerError.CODE

    constructor(msg: string) {
        super(msg)
        Error.captureStackTrace(this, UnknownPeerError)
    }
}

export interface SharedConnection {
    respondedPong: boolean
    rtt?: number
    rttStart?: number
    ping: () => void
    getPeerId: () => string
    highBackPressure: boolean
    peerInfo: PeerInfo
    getBufferedAmount(): number
    send(message: string): Promise<void>
    terminate(): void
    close(code: DisconnectionCode, reason: DisconnectionReason): void
}

export abstract class AbstractWsEndpoint<C extends SharedConnection> extends EventEmitter {
    protected metrics: Metrics

    protected readonly peerInfo: PeerInfo
    protected readonly logger: Logger
    protected readonly pingPongWs: PingPongWs
    protected readonly connectionById: Map<string, C> = new Map<string, C>()

    protected constructor(
        peerInfo: PeerInfo,
        metricsContext: MetricsContext = new MetricsContext(peerInfo.peerId),
        pingInterval = 5 * 1000
    ) {
        super()

        this.peerInfo = peerInfo
        this.logger = new Logger(module)
        this.pingPongWs = new PingPongWs(() => this.getConnections(), pingInterval)

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
            .addQueriedMetric('connections', () => this.getConnections().length)
            .addQueriedMetric('rtts', () => this.getRtts())
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return this.getConnections()
                    .reduce((sum, connection) => sum + connection.getBufferedAmount(), 0)
            })
    }

    async send(recipientId: string, message: string): Promise<void> {
        const connection = this.getConnectionByPeerId(recipientId)
        if (connection !== undefined) {
            try {
                this.evaluateBackPressure(connection)
                await connection.send(message)
            } catch (err) {
                this.metrics.record('sendFailed', 1)
                this.logger.warn('sending to %s failed, reason %s', recipientId, err)
                connection.terminate()
                throw err
            }

            this.logger.trace('sent to %s message "%s"', recipientId, message)
            this.metrics.record('outSpeed', message.length)
            this.metrics.record('msgSpeed', 1)
            this.metrics.record('msgOutSpeed', 1)
        } else {
            this.metrics.record('sendFailed', 1)
            this.logger.trace('cannot send to %s, not connected', recipientId)
            throw new UnknownPeerError(`cannot send to ${recipientId} because not connected`)
        }
    }

    protected onReceive(connection: SharedConnection, message: string): void {
        this.logger.trace('<== received from %s message "%s"', connection.peerInfo, message)
        this.emit(Event.MESSAGE_RECEIVED, connection.peerInfo, message)
    }

    close(recipientId: string, reason = DisconnectionReason.GRACEFUL_SHUTDOWN): void {
        this.metrics.record('close', 1)
        const connection = this.getConnectionByPeerId(recipientId)
        if (connection !== undefined) {
            try {
                this.logger.trace('closing connection to %s, reason %s', recipientId, reason)
                connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, reason)
            } catch (e) {
                this.logger.warn('closing connection to %s failed because of %s', recipientId, e)
            }
        }
    }

    getRtts(): Rtts {
        return this.pingPongWs.getRtts()
    }

    getPeers(): ReadonlyMap<string, C> {
        return this.connectionById
    }

    /**
     * Implementer should invoke this whenever a connection is closed.
     */
    protected onClose(connection: C, code = 0, reason = ''): void {
        if (reason === DisconnectionReason.DUPLICATE_SOCKET) {
            this.metrics.record('open:duplicateSocket', 1)
        }

        this.metrics.record('close', 1)
        this.logger.trace('socket to %s closed (code %d, reason %s)', connection.getPeerId(), code, reason)
        this.connectionById.delete(connection.getPeerId())
        this.emit(Event.PEER_DISCONNECTED, connection.peerInfo, reason)
    }

    /**
     * Implementer should invoke this whenever a new connection is formed
     */
    protected onNewConnection(connection: C): void {
        this.connectionById.set(connection.getPeerId(), connection)
        this.metrics.record('open', 1)
        this.logger.trace('added %s to connection list', connection.getPeerId())
        this.emit(Event.PEER_CONNECTED, connection.peerInfo)
    }

    /**
     * Implementer can invoke this whenever low watermark of buffer hit
     */
    protected evaluateBackPressure(connection: SharedConnection): void {
        const bufferedAmount = connection.getBufferedAmount()
        if (!connection.highBackPressure && bufferedAmount > HIGH_BACK_PRESSURE) {
            this.logger.trace('Back pressure HIGH for %s at %d', connection.peerInfo, bufferedAmount)
            this.emit(Event.HIGH_BACK_PRESSURE, connection.peerInfo)
            connection.highBackPressure = true
        } else if (connection.highBackPressure && bufferedAmount < LOW_BACK_PRESSURE) {
            this.logger.trace('Back pressure LOW for %s at %d', connection.peerInfo, bufferedAmount)
            this.emit(Event.LOW_BACK_PRESSURE, connection.peerInfo)
            connection.highBackPressure = false
        }
    }

    protected getConnections(): Array<C> {
        return [...this.connectionById.values()]
    }

    protected getConnectionByPeerId(peerId: string): C | undefined {
        return this.connectionById.get(peerId)
    }
}