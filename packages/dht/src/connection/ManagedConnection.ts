import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, setAbortableTimeout } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../identifiers'
import { createRandomConnectionId } from './Connection'

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
}

const logger = new Logger(module)

export type Events = ManagedConnectionEvents & ConnectionEvents

export class ManagedConnection extends EventEmitter<Events> {

    private implementation?: IConnection
    public connectionId: ConnectionID
    private remotePeerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType
    private handshakeCompleted = false
    private lastUsedTimestamp: number = Date.now()
    private stopped = false
    private bufferSentbyOtherConnection = false
    public replacedByOtherConnection = false
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

    public getNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.remotePeerDescriptor!)
    }

    public getLastUsedTimestamp(): number {
        return this.lastUsedTimestamp
    }

    public setRemotePeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor | undefined {
        return this.remotePeerDescriptor
    }

    public onHandshakeCompleted(peerDescriptor: PeerDescriptor): void {
        this.lastUsedTimestamp = Date.now()
        this.setRemotePeerDescriptor(peerDescriptor)
        this.connectingAbortController.abort()
        this.handshakeCompleted = true
        if (!this.bufferSentbyOtherConnection) {
            logger.trace('emitting handshake_completed')
            this.emit('handshakeCompleted', peerDescriptor)
        }
    }

    public attachImplementation(impl: IConnection): void {
        logger.trace('attachImplementation()')
        this.implementation = impl

        impl.on('data', (bytes: Uint8Array) => {
            this.lastUsedTimestamp = Date.now()
            this.emit('managedData', bytes, this.getPeerDescriptor()!)
        })

        impl.on('error', (name: string) => {
            this.emit('error', name)
        })
        impl.on('connected', () => {
            this.lastUsedTimestamp = Date.now()
            logger.trace('connected emitted')
            this.emit('connected')
        })
        impl.on('disconnected', (gracefulLeave) => this.onDisconnected(gracefulLeave))
    }

    public onDisconnected(gracefulLeave: boolean): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' onDisconnected() ' + gracefulLeave)
        if (this.bufferSentbyOtherConnection) {
            return
        }
        this.emit('disconnected', gracefulLeave)
    }

    send(data: Uint8Array): void {
        if (this.stopped) {
            throw new Err.SendFailed('ManagedConnection is stopped')
        }
        if (!this.implementation) {
            throw new Error('Invariant violation no implementation before send called')
        }
        this.lastUsedTimestamp = Date.now()
        this.implementation.send(data)
    }

    public sendNoWait(data: Uint8Array): void {
        this.lastUsedTimestamp = Date.now()
        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('sendNoWait() called on connection without implementation')
        }
    }

    public reportBufferSentByOtherConnection(): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' reportBufferSentByOtherConnection')
        logger.trace('bufferSentByOtherConnection reported')
        this.bufferSentbyOtherConnection = true
    }

    public async close(gracefulLeave: boolean): Promise<void> {
        if (this.stopped) {
            return
        }
        this.connectingAbortController.abort()
        if (this.replacedByOtherConnection) {
            logger.trace('close() called on replaced connection')
        }
               
        if (this.implementation) {
            await this.implementation.close(gracefulLeave)
        } else {
            this.emit('disconnected', gracefulLeave)
        }
        this.removeAllListeners()
    }

    public destroy(): void {
        if (this.stopped) {
            return
        }
        this.connectingAbortController.abort()
        this.stopped = true

        this.removeAllListeners()
        if (this.implementation) {
            this.implementation.destroy()
        }
    }

    isHandshakeCompleted(): boolean {
        return this.handshakeCompleted
    }

}
