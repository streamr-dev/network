import { EventEmitter } from "events"
import { Logger } from "@streamr/utils"
import { PeerId, PeerInfo } from "../PeerInfo"
import { Rtts } from "../../identifiers"
import { PingPongWs } from "./PingPongWs"
import { AbstractWsConnection } from './AbstractWsConnection'

export enum Event {
    PEER_CONNECTED = 'streamr:peer:connect',
    PEER_DISCONNECTED = 'streamr:peer:disconnect',
    MESSAGE_RECEIVED = 'streamr:message-received',
    HIGH_BACK_PRESSURE = 'streamr:high-back-pressure',
    LOW_BACK_PRESSURE = 'streamr:low-back-pressure'
}

export enum DisconnectionCode {
    GRACEFUL_SHUTDOWN = 1000,
    FAILED_HANDSHAKE = 4000,
    DEAD_CONNECTION = 4001,
    DUPLICATE_SOCKET = 4002,
    INVALID_PROTOCOL_MESSAGE = 4003
}

export enum DisconnectionReason {
    GRACEFUL_SHUTDOWN = 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET = 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAM_PARTS = 'streamr:node:no-shared-stream-parts',
    DEAD_CONNECTION = 'dead connection',
    INVALID_PROTOCOL_MESSAGE = 'streamr:protocol:invalid-protocol-message'
}

export class UnknownPeerError extends Error {
    static CODE = 'UnknownPeerError'
    readonly code = UnknownPeerError.CODE

    constructor(msg: string) {
        super(msg)
        Error.captureStackTrace(this, UnknownPeerError)
    }
}

export abstract class AbstractWsEndpoint<C extends AbstractWsConnection> extends EventEmitter {
    private readonly pingPongWs: PingPongWs
    private readonly connectionById: Map<PeerId, C> = new Map<PeerId, C>()
    private stopped = false

    protected handshakeTimeoutRefs: Record<PeerId,NodeJS.Timeout>
    protected readonly peerInfo: PeerInfo
    protected readonly logger: Logger
    protected readonly handshakeTimer: number

    protected constructor(
        peerInfo: PeerInfo,
        pingInterval = 60 * 1000
    ) {
        super()

        this.peerInfo = peerInfo
        this.logger = new Logger(module)
        this.pingPongWs = new PingPongWs(() => this.getConnections(), pingInterval)
        this.handshakeTimeoutRefs = {}
        this.handshakeTimer = 15 * 1000
    }

    async send(recipientId: PeerId, message: string): Promise<void> {
        if (this.stopped) {
            return
        }
        const connection = this.getConnectionByPeerId(recipientId)
        if (connection !== undefined) {
            try {
                connection.evaluateBackPressure()
                await connection.send(message)
            } catch (err) {
                this.logger.debug('sending to %s failed, reason %s', recipientId, err)
                connection.terminate()
                throw err
            }

            this.logger.trace('sent to %s message "%s"', recipientId, message)
        } else {
            this.logger.trace('cannot send to %s, not connected', recipientId)
            throw new UnknownPeerError(`cannot send to ${recipientId} because not connected`)
        }
    }

    close(recipientId: PeerId, code: DisconnectionCode, reason: DisconnectionReason): void {
        const connection = this.getConnectionByPeerId(recipientId)
        if (connection !== undefined) {
            try {
                this.logger.trace('closing connection to %s, reason %s', recipientId, reason)
                connection.close(code, reason)
            } catch (e) {
                this.logger.warn('closing connection to %s failed because of %s', recipientId, e)
            }
        }
    }

    stop(): Promise<void> {
        this.stopped = true
        this.pingPongWs.stop()
        Object.keys(this.handshakeTimeoutRefs).map((id) => {
            this.clearHandshake(id)
        })
        this.handshakeTimeoutRefs = {}
        return this.doStop()
    }

    getRtts(): Rtts {
        return this.pingPongWs.getRtts()
    }

    getPeers(): ReadonlyMap<PeerId, C> {
        return this.connectionById
    }

    getPeerInfos(): PeerInfo[] {
        return this.getConnections().map((connection) => connection.getPeerInfo())
    }

    clearHandshake(id: PeerId): void {
        if (this.handshakeTimeoutRefs[id]) {
            clearTimeout(this.handshakeTimeoutRefs[id])
            delete this.handshakeTimeoutRefs[id]
        }
    }

    /**
     * Custom close logic of subclass
     */
    protected abstract doClose(connection: C, code: DisconnectionCode, reason: DisconnectionReason): void

    /**
     * Custom clean up logic of subclass
     */
    protected abstract doStop(): Promise<void>

    /**
     * Implementer should invoke this whenever a new connection is formed
     */
    protected onNewConnection(connection: C): void {
        if (this.stopped) {
            connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
            return
        }
        const peerInfo = connection.getPeerInfo()
        connection.setBackPressureHandlers(
            () =>  {
                this.emitLowBackPressure(peerInfo)
            },
            () =>  {
                this.emitHighBackPressure(peerInfo)
            }
        )
        this.connectionById.set(connection.getPeerId(), connection)
        this.logger.trace('added %s to connection list', connection.getPeerId())
        this.emit(Event.PEER_CONNECTED, peerInfo)
    }

    /**
     * Implementer should invoke this whenever a message is received.
     */
    protected onReceive(connection: AbstractWsConnection, message: string): void {
        if (this.stopped) {
            return
        }
        this.logger.trace('<== received from %s message "%s"', connection.getPeerInfo(), message)
        this.emit(Event.MESSAGE_RECEIVED, connection.getPeerInfo(), message)
    }

    /**
     * Implementer should invoke this whenever a connection is closed.
     */
    protected onClose(connection: C, code: DisconnectionCode, reason: DisconnectionReason): void {
        this.logger.trace('socket to %s closed (code %d, reason %s)', connection.getPeerId(), code, reason)
        this.connectionById.delete(connection.getPeerId())
        try {
            this.doClose(connection, code, reason)
        } finally {
            this.emit(Event.PEER_DISCONNECTED, connection.getPeerInfo(), reason)
        }
    }

    protected getConnections(): C[] {
        return [...this.connectionById.values()]
    }

    protected getConnectionByPeerId(peerId: PeerId): C | undefined {
        return this.connectionById.get(peerId)
    }

    private emitLowBackPressure(peerInfo: PeerInfo): void {
        this.emit(Event.LOW_BACK_PRESSURE, peerInfo)
    }

    private emitHighBackPressure(peerInfo: PeerInfo): void {
        this.emit(Event.HIGH_BACK_PRESSURE, peerInfo)
    }
}
