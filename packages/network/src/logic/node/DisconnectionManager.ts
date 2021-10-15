import { NodeId } from './Node'
import { NameDirectory } from '../../NameDirectory'
import { DisconnectionReason } from '../../connection/ws/AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'

type HasSharedStreamsFn = (neighborId: NodeId) => boolean
type DisconnectionFn = (neighborId: NodeId, reason: DisconnectionReason) => void

const logger = new Logger(module)

export interface DisconnectionManagerOptions {
    hasSharedStreams: HasSharedStreamsFn,
    disconnect: DisconnectionFn,
    disconnectionDelayInMs: number
}

export class DisconnectionManager {
    private readonly disconnectionTimers: Record<NodeId, NodeJS.Timeout> = Object.create(null)
    private readonly hasSharedStreams: HasSharedStreamsFn
    private readonly disconnect: DisconnectionFn
    private readonly disconnectionDelayInMs: number

    constructor({ hasSharedStreams, disconnect, disconnectionDelayInMs }: DisconnectionManagerOptions) {
        this.hasSharedStreams = hasSharedStreams
        this.disconnect = disconnect
        this.disconnectionDelayInMs = disconnectionDelayInMs
    }

    scheduleDisconnectionIfNoSharedStreams(neighborId: NodeId): void {
        if (!this.hasSharedStreams(neighborId)) {
            this.cancelScheduledDisconnection(neighborId)
            this.disconnectionTimers[neighborId] = setTimeout(() => {
                delete this.disconnectionTimers[neighborId]
                if (!this.hasSharedStreams(neighborId)) {
                    logger.debug('Executing scheduled disconnect from %s', NameDirectory.getName(neighborId))
                    this.disconnect(neighborId, DisconnectionReason.NO_SHARED_STREAMS)
                }
            }, this.disconnectionDelayInMs)
            logger.trace('Scheduled disconnection from %s in %d ms', neighborId, this.disconnectionDelayInMs)
        }
    }

    cancelScheduledDisconnection(neighborId: NodeId): void {
        if (this.disconnectionTimers[neighborId] != null) {
            clearTimeout(this.disconnectionTimers[neighborId])
            delete this.disconnectionTimers[neighborId]
            logger.trace('Canceled scheduled disconnection from %s', neighborId)
        }
    }

    stop(): void {
        Object.values(this.disconnectionTimers).forEach((timeout) => {
            clearTimeout(timeout)
        })
    }
}