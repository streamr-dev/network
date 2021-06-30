import { EventEmitter } from "events"
import { Logger } from "../helpers/Logger"
import { PeerInfo } from "./PeerInfo"
import { Metrics } from "../helpers/MetricsContext"
import { Rtts } from "../identifiers"
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
}

export enum DisconnectionReason {
    GRACEFUL_SHUTDOWN = 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET = 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAMS = 'streamr:node:no-shared-streams',
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
    highBackPressure: boolean
    peerInfo: PeerInfo
    getBufferedAmount(): number
    send(message: string): Promise<void>
    terminate(): void
    close(code: DisconnectionCode, reason: DisconnectionReason): void
}

export abstract class AbstractWsEndpoint extends EventEmitter {
    protected abstract logger: Logger
    protected abstract metrics: Metrics // TODO: whole definition will move here eventually
    protected abstract pingPongWs: PingPongWs

    protected abstract getConnectionByPeerId(peerId: string): SharedConnection | undefined

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
}