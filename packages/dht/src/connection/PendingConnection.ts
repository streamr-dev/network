import EventEmitter from 'eventemitter3'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, setAbortableTimeout } from '@streamr/utils'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { IConnection } from './IConnection'

export interface PendingConnectionEvents {
    connected: (peerDescriptor: PeerDescriptor, connection: IConnection) => void
    disconnected: (gracefulLeave: boolean) => void
}

const logger = new Logger(module)

export class PendingConnection extends EventEmitter<PendingConnectionEvents> {
    private readonly connectingAbortController: AbortController = new AbortController()
    private remotePeerDescriptor: PeerDescriptor
    private replacedAsDuplicate: boolean = false
    private stopped: boolean = false

    constructor(remotePeerDescriptor: PeerDescriptor, timeout = 15 * 1000) {
        super()
        this.remotePeerDescriptor = remotePeerDescriptor
        setAbortableTimeout(() => {
            this.close(false)
        }, timeout, this.connectingAbortController.signal)
    }

    replaceAsDuplicate(): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' replaceAsDuplicate')
        this.replacedAsDuplicate = true
    }

    onHandshakeCompleted(connection: IConnection): void {
        if (!this.replacedAsDuplicate) {
            this.emit('connected', this.remotePeerDescriptor, connection)
        }
    }

    close(graceful: boolean): void {
        if (this.stopped) {
            return
        }
        this.stopped = true
        this.connectingAbortController.abort()
        if (!this.replacedAsDuplicate) {
            this.emit('disconnected', graceful)
        }
    }

    destroy(): void {
        if (this.stopped) {
            return
        }
        this.stopped = true
        this.connectingAbortController.abort()
        this.removeAllListeners()
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

}
