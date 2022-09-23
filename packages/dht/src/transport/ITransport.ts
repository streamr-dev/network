import { Message, PeerDescriptor } from '../proto/DhtRpc'

export interface TransportEvents {
    data: (message: Message, peerDescriptor: PeerDescriptor) => void
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (peerDescriptor: PeerDescriptor) => void
}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: (message: Message, peerDescriptor: PeerDescriptor) => void): void 
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    
    once<T extends keyof TransportEvents>(eventName: T, listener: (message: Message, peerDescriptor: PeerDescriptor) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void

    off<T extends keyof TransportEvents>(eventName: T, listener: (message: Message, peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void

    send(msg: Message, peerDescriptor: PeerDescriptor): void
    getPeerDescriptor(): PeerDescriptor
}
