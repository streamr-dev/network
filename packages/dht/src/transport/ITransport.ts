import { Message, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export interface TransportEvents {
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
    connected: (peerDescriptor: PeerDescriptor) => void
}

export interface SendOptions {
    doNotConnect?: boolean
    doNotMindStopped?: boolean
}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void): void

    once<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, 
        gracefulLeave: boolean) => void): void

    off<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void): void

    send(msg: Message, opts?: SendOptions): Promise<void>
    getLocalPeerDescriptor(): PeerDescriptor
    getAllConnectionPeerDescriptors(): PeerDescriptor[]
    stop(): void | Promise<void>
}
