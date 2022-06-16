import { NodeId } from '../identifiers'
import { NameDirectory } from '../NameDirectory'
import { Logger } from '@streamr/utils'

type GetAllNodesFn = () => ReadonlyArray<NodeId>
type HasSharedStreamPartsFn = (nodeId: NodeId) => boolean
type DisconnectFn = (nodeId: NodeId, reason: string) => void

const logger = new Logger(module)

export interface DisconnectionManagerOptions {
    getAllNodes: GetAllNodesFn,
    hasSharedStreamParts: HasSharedStreamPartsFn,
    disconnect: DisconnectFn,
    disconnectionDelayInMs: number,
    cleanUpIntervalInMs: number
}

/**
 * DisconnectionManager assists a network node in disconnecting from other nodes when streams are
 * no longer shared between them.
 *
 * There are two ways this is achieved:
 *  1. Manual: a node can schedule (and cancel) disconnections that get executed after `disconnectionDelayInMs` if
 *      they still don't share streams.
 *  2. Automatic: a clean up interval is ran periodically in which any node without shared streams gets disconnected
 *      from.
 */
export class DisconnectionManager {
    public static DISCONNECTION_REASON = 'no shared streams'

    private readonly disconnectionTimers = new Map<NodeId, NodeJS.Timeout>()
    private readonly getAllNodes: GetAllNodesFn
    private readonly hasSharedStreams: HasSharedStreamPartsFn
    private readonly disconnect: DisconnectFn
    private readonly disconnectionDelayInMs: number
    private readonly cleanUpIntervalInMs: number
    private connectionCleanUpInterval: NodeJS.Timeout | null = null

    constructor({
        getAllNodes,
        hasSharedStreamParts: hasSharedStreams,
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
                    this.loggedDisconnect(nodeId)
                })
            }
        }, this.cleanUpIntervalInMs)
    }

    stop(): void {
        clearInterval(this.connectionCleanUpInterval!)
        this.disconnectionTimers.forEach((timeout) => {
            clearTimeout(timeout)
        })
    }

    scheduleDisconnectionIfNoSharedStreamParts(nodeId: NodeId): void {
        if (!this.hasSharedStreams(nodeId)) {
            this.cancelScheduledDisconnection(nodeId)
            this.disconnectionTimers.set(nodeId, setTimeout(() => {
                this.disconnectionTimers.delete(nodeId)
                if (!this.hasSharedStreams(nodeId)) {
                    this.loggedDisconnect(nodeId)
                }
            }, this.disconnectionDelayInMs))
            logger.trace('scheduled disconnection from %s in %d ms', nodeId, this.disconnectionDelayInMs)
        }
    }

    cancelScheduledDisconnection(nodeId: NodeId): void {
        const timeout = this.disconnectionTimers.get(nodeId)
        if (timeout !== undefined) {
            clearTimeout(timeout)
            this.disconnectionTimers.delete(nodeId)
            logger.trace('canceled scheduled disconnection from %s', nodeId)
        }
    }

    private loggedDisconnect(nodeId: NodeId): void {
        logger.trace('executing disconnect from %s', NameDirectory.getName(nodeId))
        this.disconnect(nodeId, DisconnectionManager.DISCONNECTION_REASON)
    }
}
