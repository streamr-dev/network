import { NodeId } from './Node'
import { NameDirectory } from '../../NameDirectory'
import { DisconnectionReason } from '../../connection/ws/AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'

type GetAllNodesFn = () => ReadonlyArray<NodeId>
type HasSharedStreamsFn = (nodeId: NodeId) => boolean
type DisconnectionFn = (nodeId: NodeId, reason: DisconnectionReason) => void

const logger = new Logger(module)

export interface DisconnectionManagerOptions {
    getAllNodes: GetAllNodesFn,
    hasSharedStreams: HasSharedStreamsFn,
    disconnect: DisconnectionFn,
    disconnectionDelayInMs: number,
    cleanUpIntervalInMs: number
}

export class DisconnectionManager {
    private readonly disconnectionTimers: Record<NodeId, NodeJS.Timeout> = Object.create(null)
    private readonly getAllNodes: GetAllNodesFn
    private readonly hasSharedStreams: HasSharedStreamsFn
    private readonly disconnect: DisconnectionFn
    private readonly disconnectionDelayInMs: number
    private readonly cleanUpIntervalInMs: number
    private connectionCleanUpInterval: NodeJS.Timeout | null = null

    constructor({
        getAllNodes,
        hasSharedStreams,
        disconnect,
        disconnectionDelayInMs,
        cleanUpIntervalInMs
    }: DisconnectionManagerOptions) {
        this.getAllNodes = getAllNodes
        this.hasSharedStreams = hasSharedStreams
        this.disconnect = disconnect
        this.disconnectionDelayInMs = disconnectionDelayInMs
        this.cleanUpIntervalInMs = cleanUpIntervalInMs
    }

    start(): void {
        this.connectionCleanUpInterval = setInterval(() => {
            const nodeIds = this.getAllNodes()
            const nonNeighborNodeIds = nodeIds.filter((nodeId) => !this.hasSharedStreams(nodeId))
            if (nonNeighborNodeIds.length > 0) {
                logger.debug('connectionCleanUpInterval: disconnecting from %d nodes', nonNeighborNodeIds.length)
                nonNeighborNodeIds.forEach((nodeId) => {
                    logger.trace('executing disconnect from %s', NameDirectory.getName(nodeId))
                    this.disconnect(nodeId, DisconnectionReason.NO_SHARED_STREAMS)
                })
            }
        }, this.cleanUpIntervalInMs)
    }

    stop(): void {
        clearInterval(this.connectionCleanUpInterval!)
        Object.values(this.disconnectionTimers).forEach((timeout) => {
            clearTimeout(timeout)
        })
    }

    scheduleDisconnectionIfNoSharedStreams(nodeId: NodeId): void {
        if (!this.hasSharedStreams(nodeId)) {
            this.cancelScheduledDisconnection(nodeId)
            this.disconnectionTimers[nodeId] = setTimeout(() => {
                delete this.disconnectionTimers[nodeId]
                if (!this.hasSharedStreams(nodeId)) {
                    logger.trace('executing disconnect from %s', NameDirectory.getName(nodeId))
                    this.disconnect(nodeId, DisconnectionReason.NO_SHARED_STREAMS)
                }
            }, this.disconnectionDelayInMs)
            logger.trace('scheduled disconnection from %s in %d ms', nodeId, this.disconnectionDelayInMs)
        }
    }

    cancelScheduledDisconnection(nodeId: NodeId): void {
        if (this.disconnectionTimers[nodeId] != null) {
            clearTimeout(this.disconnectionTimers[nodeId])
            delete this.disconnectionTimers[nodeId]
            logger.trace('canceled scheduled disconnection from %s', nodeId)
        }
    }
}