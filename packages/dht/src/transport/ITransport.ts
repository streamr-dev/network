import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { ConnectionStatistics, SendQueueHint } from '../connection/ConnectionStatistics'
import { DhtAddress } from '../identifiers'

export interface TransportEvents {
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
    // periodic per-connection send/receive statistics (opt-in, see ConnectionManagerOptions.statisticsInterval);
    // nodeId is toNodeId(peerDescriptor), passed along so listeners need not recompute it
    statisticsUpdated: (peerDescriptor: PeerDescriptor, statistics: ConnectionStatistics, nodeId: DhtAddress) => void
}

export interface SendOptions {
    connect: boolean
    sendIfStopped: boolean
    bufferWhileConnecting: boolean
    /** see SendQueueHint: only live media should ever set this */
    sendQueueHint?: SendQueueHint
}

export const DEFAULT_SEND_OPTIONS = {
    connect: true,
    sendIfStopped: false,
    bufferWhileConnecting: true
}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor,
        statistics: ConnectionStatistics, nodeId: DhtAddress) => void): void

    once<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, 
        gracefulLeave: boolean) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor,
        statistics: ConnectionStatistics, nodeId: DhtAddress) => void): void

    off<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor,
        statistics: ConnectionStatistics, nodeId: DhtAddress) => void): void

    send(msg: Message, opts?: SendOptions): Promise<void>
    /** withdraw the messages queued for `nodeId` under `purgeKey`; returns how many */
    purgeSendQueue?(nodeId: DhtAddress, purgeKey: string): number
    getLocalPeerDescriptor(): PeerDescriptor
    stop(): void | Promise<void>
    getDiagnosticInfo(): Record<string, unknown>
}
