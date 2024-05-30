import EventEmitter from 'eventemitter3'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, setAbortableTimeout } from '@streamr/utils'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'

interface Events {
    connected: () => void
    disconnected: (gracefulLeave: boolean) => void
}

const logger = new Logger(module)

export class PendingConnection extends EventEmitter<Events> {
    private readonly connectingAbortController: AbortController = new AbortController()
    private remotePeerDescriptor: PeerDescriptor
    private replacedAsDuplicate: boolean = false
    public stopped: boolean = false
    private destroyReason?: string

    constructor(remotePeerDescriptor: PeerDescriptor) {
        super()
        this.remotePeerDescriptor = remotePeerDescriptor
        setAbortableTimeout(() => {
            this.close(false)
        }, 15 * 1000, this.connectingAbortController.signal)
    }

    replaceAsDuplicate(): void {
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' replaceAsDuplicate')
        this.replacedAsDuplicate = true
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

    destroy(reason: string): void {
        if (this.stopped) {
            return
        }
        this.destroyReason = reason
        this.stopped = true
        this.connectingAbortController.abort()
        this.removeAllListeners()
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

}
