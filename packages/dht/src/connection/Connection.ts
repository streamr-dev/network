import { PeerDescriptor } from "../proto/DhtRpc"
import { ConnectionID } from "../types"

export enum Event {
    DATA = 'streamr:dht:connection:data',
    CONNECTED = 'streamr:dht:connection:connected',
    DISCONNECTED = 'streamr:dht:connection:disconnected',
    ERROR = 'streamr:dht:connection:error'
}

export interface Connection {
    
    connectionId: ConnectionID

    on(event: Event.DATA, listener: (bytes: Uint8Array) => void): this
    on(event: Event.ERROR, listener: (name: string) => void): this
    on(event: Event.CONNECTED, listener: () => void): this
    on(event: Event.DISCONNECTED, listener: (code: number, reason: string) => void): this
    
    once(event: Event.DATA, listener: (bytes: Uint8Array) => void): this
    once(event: Event.ERROR, listener: (name: string) => void): this
    once(event: Event.CONNECTED, listener: () => void): this
    once(event: Event.DISCONNECTED, listener: (code: number, reason: string) => void): this

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void
    get peerDescriptor(): PeerDescriptor | null

    send(data: Uint8Array): void
    sendBufferedMessages(): void
    close(): void
}