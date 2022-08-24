import { Message, PeerDescriptor } from '../proto/DhtRpc'

export interface TransportEvents {
    DATA: (message: Message, peerDescriptor: PeerDescriptor) => void   
}

/*
export enum Event {
    DATA = 'streamr:dht-node:layer-0:message-router:on-data'
}
*/

export interface ITransport {
    //on(event: Event.DATA, listener: (message: Message, peerDescriptor: PeerDescriptor) => void): this
    on<T extends keyof TransportEvents>(eventName: T, listener: TransportEvents[T]): void 
        
    send(msg: Message, peerDescriptor: PeerDescriptor): void
    getPeerDescriptor(): PeerDescriptor
}
