import { ConnectionID, ConnectionType, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, setAbortableTimeout } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../identifiers'
import { createRandomConnectionId } from './Connection'

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (gracefulLeave: boolean) => void
}

const logger = new Logger(module)

export type Events = ManagedConnectionEvents

export class ManagedConnection extends EventEmitter<ManagedConnectionEvents> {

    private connection?: IConnection
    public connectionId: ConnectionID
    private remotePeerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType
    private lastUsedTimestamp: number = Date.now()
    private connected = false
    private replacedAsDuplicate = false
    private stopped = false
    private readonly connectingAbortController: AbortController = new AbortController()

    constructor(connectionType: ConnectionType) {
        super()
        this.connectionType = connectionType
        this.connectionId = createRandomConnectionId()
        logger.trace('creating ManagedConnection of type: ' + connectionType)
        setAbortableTimeout(() => {
            this.close(false)
        }, 15 * 1000, this.connectingAbortController.signal)
    }

    getNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.remotePeerDescriptor!)
    }

    getLastUsedTimestamp(): number {
        return this.lastUsedTimestamp
    }

    setRemotePeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    getPeerDescriptor(): PeerDescriptor | undefined {
        return this.remotePeerDescriptor
    }

    attachConnection(peerDescriptor: PeerDescriptor, connection: IConnection): void {
        logger.trace('attachConnection()')
        this.connection = connection

        connection.on('data', (bytes: Uint8Array) => {
            this.lastUsedTimestamp = Date.now()
            this.emit('managedData', bytes, this.getPeerDescriptor()!)
        })
        connection.on('disconnected', (gracefulLeave) => this.onDisconnected(gracefulLeave))

        this.lastUsedTimestamp = Date.now()
        this.setRemotePeerDescriptor(peerDescriptor)
        this.connectingAbortController.abort()
        this.connected = true
        if (!this.replacedAsDuplicate) {
            logger.trace('emitting connection')
            this.emit('connected', peerDescriptor)
        }
    }

    onDisconnected(gracefulLeave: boolean): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' onDisconnected() ' + gracefulLeave)
        if (this.replacedAsDuplicate) {
            return
        }
        this.emit('disconnected', gracefulLeave)
    }

    send(data: Uint8Array): void {
        if (this.stopped) {
            throw new Err.SendFailed('ManagedConnection is stopped')
        }
        if (!this.connection) {
            throw new Error('Invariant violation no implementation before send called')
        }
        this.lastUsedTimestamp = Date.now()
        this.connection.send(data)
    }

    replaceAsDuplicate(): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' replaceAsDuplicate')
        this.replacedAsDuplicate = true
    }

    async close(gracefulLeave: boolean): Promise<void> {
        if (this.stopped) {
            return
        }
        this.connectingAbortController.abort()
        if (this.replacedAsDuplicate) {
            logger.trace('close() called on replaced connection')
        }
               
        if (this.connection) {
            await this.connection.close(gracefulLeave)
        } else {
            this.emit('disconnected', gracefulLeave)
        }
        this.removeAllListeners()
    }

    destroy(): void {
        if (this.stopped) {
            return
        }
        this.connectingAbortController.abort()
        this.stopped = true

        this.removeAllListeners()
        if (this.connection) {
            this.connection.destroy()
        }
    }

    isConnected(): boolean {
        return this.connected
    }

}
