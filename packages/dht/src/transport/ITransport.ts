import { Message, PeerDescriptor } from '../proto/DhtRpc'

export enum Event {
    DATA = 'streamr:dht-node:layer-0:message-router:on-data'
}

export interface ITransport {
    on(event: Event.DATA, listener: (peerDescriptor: PeerDescriptor, message: Message) => void): this
    send(peerDescriptor: PeerDescriptor, msg: Message): void
}