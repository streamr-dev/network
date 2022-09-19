import { Message, PeerDescriptor } from '../proto/DhtRpc'

export interface TransportEvents {
    data: (message: Message, peerDescriptor: PeerDescriptor) => void   
}

export interface ITransport {
    on<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void 
    once<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void
    off<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void    
    send(msg: Message, peerDescriptor: PeerDescriptor): void
    getPeerDescriptor(): PeerDescriptor
}
