import {PeerInfo} from './PeerInfo'
import { Rtts } from '../identifiers'

export enum Event {
    PEER_CONNECTED = 'streamr:peer:connect',
    PEER_DISCONNECTED = 'streamr:peer:disconnect',
    CLOSED_DUPLICATE_SOCKET_TO_PEER = 'streamr:peer:closeduplicate',
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

export interface IWsEndpoint {

    on(event: Event.PEER_CONNECTED, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.PEER_DISCONNECTED, listener: (peerInfo: PeerInfo, reason: string) => void): this
    on(event: Event.MESSAGE_RECEIVED, listener: (peerInfo: PeerInfo, message: string) => void): this
    on(event: Event.HIGH_BACK_PRESSURE, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.LOW_BACK_PRESSURE, listener: (peerInfo: PeerInfo) => void): this

    connect(peerAddress: string): Promise<string>
    send(recipientId: string, message: string): Promise<string>
    close(recipientId: string, reason: DisconnectionReason): void
    getRtts(): Rtts
    getPeerInfo(): Readonly<PeerInfo>
    getAddress(): string
    stop(): Promise<void>

    isConnected(address: string): boolean
    getPeerInfos(): PeerInfo[]
    resolveAddress(peerId: string): string | never
}
