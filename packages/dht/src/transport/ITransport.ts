import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'

export interface TransportEvents {
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
    connected: (peerDescriptor: PeerDescriptor) => void
}

export interface SendOptions {
    connect: boolean
    sendIfStopped: boolean
}

export const DEFAULT_SEND_OPTIONS = {
    connect: true,
    sendIfStopped: false
}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    on<T extends keyof TransportEvents>(
        eventName: T,
        listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    ): void

    once<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    once<T extends keyof TransportEvents>(
        eventName: T,
        listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    ): void

    off<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof TransportEvents>(
        eventName: T,
        listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    ): void

    send(msg: Message, opts?: SendOptions): Promise<void>
    getLocalPeerDescriptor(): PeerDescriptor
    stop(): void | Promise<void>
    getDiagnosticInfo(): Record<string, unknown>
}
