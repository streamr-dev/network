import { PeerDescriptor } from '../proto/DhtRpc'

export enum Event {
    DATA = 'streamr:dht:connection:connectionmanager:data'
}

export interface IConnectionManager {
    on(event: Event.DATA, listener: (peerDescriptor: PeerDescriptor, bytes: Uint8Array) => void): this
    send(peerDescriptor: PeerDescriptor, bytes: Uint8Array): void
}