import { ConnectionID, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../identifiers'
import { createRandomConnectionId } from './Connection'

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    disconnected: (gracefulLeave: boolean) => void
}

const logger = new Logger(module)

export type Events = ManagedConnectionEvents

// ManagedConnection is a component used as a wrapper for IConnection after they have been successfully handshaked.
// Should only be used in the ConnectionManager.
export class ManagedConnection extends EventEmitter<ManagedConnectionEvents> {

    private connection: IConnection
    public connectionId: ConnectionID
    private remotePeerDescriptor: PeerDescriptor
    private lastUsedTimestamp: number = Date.now()
    private stopped = false
    private replacedAsDuplicate = false

    constructor(peerDescriptor: PeerDescriptor, connection: IConnection) {
        super()
        this.connectionId = createRandomConnectionId()
        this.connection = connection

        connection.on('data', (bytes: Uint8Array) => {
            this.lastUsedTimestamp = Date.now()
            this.emit('managedData', bytes, this.getPeerDescriptor()!)
        })
        connection.on('disconnected', (gracefulLeave) => this.onDisconnected(gracefulLeave))

        this.lastUsedTimestamp = Date.now()
        this.remotePeerDescriptor = peerDescriptor
    }

    private onDisconnected(gracefulLeave: boolean): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' onDisconnected() ' + gracefulLeave)
        if (!this.replacedAsDuplicate) {
            this.emit('disconnected', gracefulLeave)
        }
    }

    // TODO: Can this be removed if ManagedConnections can never be duplicates?
    // Handle duplicates in the ConncetorFacade and no longer have PendingConnections in ConnectionManager
    replaceAsDuplicate(): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' replaceAsDuplicate')
        this.replacedAsDuplicate = true
    }

    send(data: Uint8Array): void {
        if (this.stopped) {
            throw new Err.SendFailed('ManagedConnection is stopped')
        }
        this.lastUsedTimestamp = Date.now()
        this.connection.send(data)
    }

    async close(gracefulLeave: boolean): Promise<void> {
        if (this.stopped) {
            return
        }
        await this.connection.close(gracefulLeave)       
        this.removeAllListeners()
    }

    getNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)
    }

    getLastUsedTimestamp(): number {
        return this.lastUsedTimestamp
    }

    getPeerDescriptor(): PeerDescriptor | undefined {
        return this.remotePeerDescriptor
    }

}
