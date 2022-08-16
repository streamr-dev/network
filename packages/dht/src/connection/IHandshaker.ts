import { PeerID } from '../helpers/PeerID'
import { PeerDescriptor } from '../proto/DhtRpc'

export enum Event {
    HANDSHAKE_FAILED = 'streamr:handshaker:handshake:failed',
    HANDSHAKE_COMPLETED = 'streamr:handshaker:handshake:completed'
}

export interface IHandshaker {
    on(event: Event.HANDSHAKE_COMPLETED, listener: (peerDescriptor: PeerDescriptor) => void): this
    on(event: Event.HANDSHAKE_FAILED, listener: (peerId: PeerID) => void): this
    
    once(event: Event.HANDSHAKE_COMPLETED, listener: (peerDescriptor: PeerDescriptor) => void): this
    once(event: Event.HANDSHAKE_FAILED, listener: (peerId: PeerID) => void): this
}
