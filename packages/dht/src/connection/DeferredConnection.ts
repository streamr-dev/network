import { ConnectionType, IConnection } from './IConnection'
import { EventEmitter } from 'events'
import { ConnectionID } from '../types'
import { PeerDescriptor } from '../proto/DhtRpc'
import { Logger } from '../helpers/Logger'

const logger = new Logger(module)

export class DeferredConnection extends EventEmitter implements IConnection {
    connectionId: ConnectionID
    private buffer: Uint8Array[] = []
    public connectionType = ConnectionType.DEFERRED
    private readonly peerDescriptor: PeerDescriptor

    constructor(targetPeerDescriptor: PeerDescriptor) {
        super()
        this.connectionId = new ConnectionID()
        this.peerDescriptor = targetPeerDescriptor
    }

    close(): void {
        logger.trace(`Closing deferred connection ${this.connectionId.toString()}`)
        this.buffer = []
        this.removeAllListeners()
    }

    getPeerDescriptor(): PeerDescriptor | null {
        return this.peerDescriptor
    }

    send(data: Uint8Array): void {
        this.buffer.push(data)
    }

    sendBufferedMessages(): void {
    }

    getBufferedMessages(): Uint8Array[] {
        return this.buffer
    }

    setPeerDescriptor(_peerDescriptor: PeerDescriptor): void {
    }
}