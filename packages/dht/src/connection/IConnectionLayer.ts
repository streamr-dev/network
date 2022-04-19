import { PeerID } from '../types'

export enum Event {
    RPC_CALL = 'streamr:dht:connection:rpc-call'
}

export interface IConnectionLayer {
    on(event: Event.RPC_CALL, listener: (bytes: Uint8Array) => void): this
    send(peerId: PeerID, bytes: Uint8Array): void
}