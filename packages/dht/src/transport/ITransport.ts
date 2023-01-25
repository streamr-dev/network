import { Message, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export interface TransportEvents {
    message: (message: Message) => void
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (peerDescriptor: PeerDescriptor) => void
}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void 
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    
    once<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void

    off<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void

    send(msg: Message, doNotConnect?: boolean): Promise<void>
    getPeerDescriptor(): PeerDescriptor
    getAllConnectionPeerDescriptors(): PeerDescriptor[]
    stop(): void | Promise<void>
}
