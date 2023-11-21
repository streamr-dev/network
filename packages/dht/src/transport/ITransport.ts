import { Message, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export interface TransportEvents {
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
    connected: (peerDescriptor: PeerDescriptor) => void

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

    // TODO: change ITransport#send to get options inside an object
    send(msg: Message, doNotConnect?: boolean): Promise<void>
    getLocalPeerDescriptor(): PeerDescriptor
    getAllConnectionPeerDescriptors(): PeerDescriptor[]
    stop(): void | Promise<void>
}
