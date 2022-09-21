import { PeerDescriptor } from "../proto/DhtRpc"

export enum Event {
    DATA = 'streamr:dht:managedconnection:data',
    HANDSHAKE_COMPLETED = 'streamr:dht:managedconnection:handshake:completed'
}

export interface IManagedConnection {
    
    on(event: Event.DATA, listener: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void): this 
    on(event: Event.HANDSHAKE_COMPLETED, listener: (peerDescriptor: PeerDescriptor) => void): this 
    
    once(event: Event.DATA, listener: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void): this
    once(event: Event.HANDSHAKE_COMPLETED, listener: (peerDescriptor: PeerDescriptor) => void): this 
}
