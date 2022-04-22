import { PeerID } from '../types'

export enum Event {
    DATA = 'streamr:dht:connection:connectionmanager:data'
}

export interface IConnectionManager {
    on(event: Event.DATA, listener: (bytes: Uint8Array) => void): this
    send(peerId: PeerID, bytes: Uint8Array): void
}