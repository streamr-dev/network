import { Message, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export type DisconnectionType = 'OUTGOING_GRACEFUL_DISCONNECT' | 'OUTGOING_GRACEFUL_LEAVE' |
    'INCOMING_GRACEFUL_DISCONNECT' | 'INCOMING_GRACEFUL_LEAVE' | 'OTHER'

export interface TransportEvents {
    disconnected: (peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType) => void
    message: (message: Message) => void
    connected: (peerDescriptor: PeerDescriptor) => void

}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    on<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType) => void): void

    once<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    once<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, 
        disconnectionType: DisconnectionType) => void): void

    off<T extends keyof TransportEvents>(eventName: T, listener: (message: Message) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof TransportEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType) => void): void

    send(msg: Message, doNotConnect?: boolean): Promise<void>
    getPeerDescriptor(): PeerDescriptor
    getAllConnectionPeerDescriptors(): PeerDescriptor[]
    stop(): void | Promise<void>
}
