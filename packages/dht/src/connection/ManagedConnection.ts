import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { Handshaker } from './Handshaker'
import { HandshakeError, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, setAbortableTimeout } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../identifiers'
import { createRandomConnectionId } from './Connection'

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeRequest: (source: PeerDescriptor, version: string, target?: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: () => void
}

const logger = new Logger(module)

export type Events = ManagedConnectionEvents & ConnectionEvents

export class ManagedConnection extends EventEmitter<Events> {

    private implementation?: IConnection
    public connectionId: ConnectionID
    private remotePeerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType
    private handshaker?: Handshaker
    private handshakeCompleted = false
    private lastUsedTimestamp: number = Date.now()
    private stopped = false
    private bufferSentbyOtherConnection = false
    public replacedByOtherConnection = false
    private localPeerDescriptor: PeerDescriptor
    protected outgoingConnection?: IConnection
    protected incomingConnection?: IConnection
    private readonly connectingAbortController: AbortController = new AbortController()

    constructor(
        localPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        outgoingConnection?: IConnection,
        incomingConnection?: IConnection,
        targetPeerDescriptor?: PeerDescriptor
    ) {
        super()

        this.localPeerDescriptor = localPeerDescriptor
        this.outgoingConnection = outgoingConnection
        this.incomingConnection = incomingConnection
        this.connectionType = connectionType
        this.connectionId = createRandomConnectionId()

        this.send = this.send.bind(this)
        this.onDisconnected = this.onDisconnected.bind(this)

        logger.trace('creating ManagedConnection of type: ' + connectionType)
        if (incomingConnection && outgoingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either an incoming connection OR a outgoing connection')
        }

        if (outgoingConnection) {
            this.handshaker = new Handshaker(this.localPeerDescriptor, outgoingConnection)

            this.handshaker.once('handshakeFailed', (error) => {
                if (error === HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR || error === HandshakeError.UNSUPPORTED_VERSION) {
                    // TODO should we have some handling for this floating promise?
                    this.close(false)
                } else {
                    logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' handshakeFailed: ' + error)
                    this.emit('handshakeFailed')
                }
            })

            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                logger.trace('handshake completed for outgoing connection '
                    + ', ' + getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor))
                this.attachImplementation(outgoingConnection)
                this.onHandshakeCompleted(peerDescriptor)
            })

            outgoingConnection.once('connected', () => {
                this.handshaker!.sendHandshakeRequest(targetPeerDescriptor)
                this.emit('connected')
            })
            outgoingConnection.once('disconnected', this.onDisconnected)

        } else if (incomingConnection) {
            this.handshaker = new Handshaker(this.localPeerDescriptor, incomingConnection)
            this.handshaker.on('handshakeRequest', (
                sourcePeerDescriptor: PeerDescriptor,
                version: string,
                targetPeerDescriptor?: PeerDescriptor
            ) => {
                this.setRemotePeerDescriptor(sourcePeerDescriptor)
                this.emit('handshakeRequest', sourcePeerDescriptor, version, targetPeerDescriptor)
            })

            incomingConnection.on('disconnected', this.onDisconnected)
        }
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

    private onHandshakeCompleted(peerDescriptor: PeerDescriptor) {
        this.lastUsedTimestamp = Date.now()

        this.setRemotePeerDescriptor(peerDescriptor)
        this.handshakeCompleted = true
        this.handshaker!.stop()
        this.connectingAbortController.abort()
        logger.trace('emitting handshake_completed')
        this.emit('handshakeCompleted', peerDescriptor)
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

        //ensure that we have subscribed to the event only once
        impl.off('disconnected', this.onDisconnected)
        impl.on('disconnected', this.onDisconnected)
    }

    private onDisconnected(gracefulLeave: boolean): void {
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
        this.implementation!.send(data)
    }

    public sendNoWait(data: Uint8Array): void {
        this.lastUsedTimestamp = Date.now()
        if (this.implementation) {
            this.implementation.send(data)
        }
    }

    public reportBufferSentByOtherConnection(): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' reportBufferSentByOtherConnection')
        if (this.handshaker) {
            this.handshaker.removeAllListeners()
        }
        logger.trace('bufferSentByOtherConnection reported')
        this.bufferSentbyOtherConnection = true
    }

    public acceptHandshake(): void {
        // This happens when connectionRequest has been made and answered
        if (this.implementation) {
            if (!this.handshaker) {
                this.handshaker = new Handshaker(this.localPeerDescriptor, this.implementation)
            }
            this.handshaker.sendHandshakeResponse()
        } else {  // This happens to when there is a regular incoming connection
            this.handshaker!.sendHandshakeResponse()
            this.attachImplementation(this.incomingConnection!)
        }
        this.onHandshakeCompleted(this.remotePeerDescriptor!)
    }

    public rejectHandshake(error: HandshakeError): void {
        this.handshaker!.sendHandshakeResponse(error)
        this.destroy()
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
            await this.implementation?.close(gracefulLeave)
        } else if (this.outgoingConnection) {
            await this.outgoingConnection?.close(gracefulLeave)
        } else if (this.incomingConnection) {
            await this.incomingConnection?.close(gracefulLeave)
        } else {
            this.emit('disconnected', gracefulLeave)
        }
    }

    public destroy(): void {
        if (this.stopped) {
            return
        }
        this.connectingAbortController.abort()
        this.stopped = true

        this.removeAllListeners()
        if (this.implementation) {
            this.implementation?.destroy()
        } else if (this.outgoingConnection) {
            this.outgoingConnection?.destroy()
        } else if (this.incomingConnection) {
            this.incomingConnection?.destroy()
        }
    }

    isHandshakeCompleted(): boolean {
        return this.handshakeCompleted
    }

}
