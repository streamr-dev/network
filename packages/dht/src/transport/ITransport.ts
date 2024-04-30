import { Message, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export interface TransportEvents {
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
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
    // TODO: Why do on, once and off need to be defined multiple times per function type?
    on<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    on<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    on<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void

    once<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    once<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    once<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void

    off<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    off<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    off<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void

    send(msg: Message, opts?: SendOptions): Promise<void>
    getLocalPeerDescriptor(): PeerDescriptor
    stop(): void | Promise<void>
}
