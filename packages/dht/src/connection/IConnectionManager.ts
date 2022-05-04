import { Message, PeerDescriptor } from '../proto/DhtRpc'

export enum Event {
    MESSAGE = 'streamr:dht:connection:iconnectionmanager:message'
}

export interface IConnectionManager {
    on(event: Event.MESSAGE, listener: (peerDescriptor: PeerDescriptor, message: Message) => void): this
    send(peerDescriptor: PeerDescriptor, message: Message): void
}