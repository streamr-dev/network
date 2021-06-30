import { EventEmitter } from "events"
import { Logger } from "../helpers/Logger"
import { PeerInfo } from "./PeerInfo"

export const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
export const LOW_BACK_PRESSURE = 1024 * 1024

export interface SharedConnection {
    highBackPressure: boolean
    peerInfo: PeerInfo
    getBufferedAmount(): number
}

export abstract class AbstractWsEndpoint extends EventEmitter {
    protected abstract logger: Logger

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