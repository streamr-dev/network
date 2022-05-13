import { ConnectionType, IConnection } from './IConnection'
import { EventEmitter } from 'events'
import { ConnectionID } from '../types'
import { PeerDescriptor } from '../proto/DhtRpc'

export class DeferredConnection extends EventEmitter implements IConnection {
    connectionId: ConnectionID
    private buffer: Uint8Array[] = []
    public connectionType = ConnectionType.DEFERRED
    private readonly peerDescriptor: PeerDescriptor

    constructor(private targetPeerDescriptor: PeerDescriptor) {
        super()
        this.connectionId = new ConnectionID()
        this.peerDescriptor = targetPeerDescriptor
    }

    close(): void {
        this.buffer = []
    }

    getPeerDescriptor(): PeerDescriptor | null {
        return this.peerDescriptor
    }

    send(data: Uint8Array): void {
        this.buffer.push(data)
    }

    sendBufferedMessages(): void {
    }

    setPeerDescriptor(_peerDescriptor: PeerDescriptor): void {
    }
}