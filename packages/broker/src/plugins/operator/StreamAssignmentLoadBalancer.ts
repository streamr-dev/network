import { OperatorFleetStateEvents } from './OperatorFleetState'
import { MaintainTopologyHelperEvents } from './MaintainTopologyHelper'
import { StreamID, StreamPartID } from '@streamr/protocol'
import { StreamrClient } from 'streamr-client'
import { Logger } from '@streamr/utils'
import pLimit from 'p-limit'
import EventEmitter3 from 'eventemitter3'
import { ConstHash } from './ConstHash'

const logger = new Logger(module)

interface StreamAssignmentLoadBalancerEvents {
    assigned(streamPartId: StreamPartID): void
    unassigned(streamPartId: StreamPartID): void
}

export class StreamAssignmentLoadBalancer extends EventEmitter3<StreamAssignmentLoadBalancerEvents> {
    private readonly allStreamParts = new Set<StreamPartID>()
    private readonly myStreamParts = new Set<StreamPartID>()
    private readonly concurrencyLimit = pLimit(1)
    private readonly consistentHash = new ConstHash()
    private readonly myNodeId: string
    private readonly streamrClient: StreamrClient
    private readonly operatorFleetState: EventEmitter3<OperatorFleetStateEvents>
    private readonly maintainTopologyHelper: EventEmitter3<MaintainTopologyHelperEvents>

    constructor(
        myNodeId: string,
        streamrClient: StreamrClient,
        operatorFleetState: EventEmitter3<OperatorFleetStateEvents>,
        maintainTopologyHelper: EventEmitter3<MaintainTopologyHelperEvents>,
    ) {
        super()
        this.myNodeId = myNodeId
        this.streamrClient = streamrClient
        this.operatorFleetState = operatorFleetState
        this.maintainTopologyHelper = maintainTopologyHelper
        this.consistentHash.add(myNodeId)
        this.operatorFleetState.on('added', this.nodeAdded)
        this.operatorFleetState.on('removed', this.nodeRemoved)
        this.maintainTopologyHelper.on('addStakedStream', this.streamAdded)
        this.maintainTopologyHelper.on('removeStakedStream', this.streamRemoved)
    }

    private nodeAdded = this.concurrencyLimiter( async (nodeId: string): Promise<void> => {
        if (nodeId === this.myNodeId) {
            return
        }
        this.consistentHash.add(nodeId)
        this.recalculateAssignments()
    })

    private nodeRemoved = this.concurrencyLimiter( async (nodeId: string): Promise<void> => {
        if (nodeId === this.myNodeId) {
            return
        }
        this.consistentHash.remove(nodeId)
        this.recalculateAssignments()
    })

    private streamAdded = this.concurrencyLimiter(async (streamIds: StreamID[]): Promise<void> => {
        const streamPartIds = (await Promise.all(streamIds.map(this.getStreamPartIds))).flat()
        for (const streamPartId of streamPartIds) {
            this.allStreamParts.add(streamPartId)
        }
        this.recalculateAssignments() // TODO: optimize; calculate efficiently by only considering added stream parts
    })

    private streamRemoved = this.concurrencyLimiter(async (streamId: StreamID): Promise<void> => {
        const streamPartIds = await this.getStreamPartIds(streamId)
        for (const streamPartId of streamPartIds) {
            this.allStreamParts.delete(streamPartId)
        }
        this.recalculateAssignments() // TODO: optimize; calculate efficiently by only considering removed stream parts
    })

    private recalculateAssignments(): void {
        for (const streamPartId of this.allStreamParts) {
            if (this.consistentHash.get(streamPartId) === this.myNodeId && !this.myStreamParts.has(streamPartId)) {
                this.myStreamParts.add(streamPartId)
                this.emit('assigned', streamPartId)
            }
        }
        for (const streamPartId of this.myStreamParts) {
            if (!this.allStreamParts.has(streamPartId) || this.consistentHash.get(streamPartId) !== this.myNodeId) {
                this.myStreamParts.delete(streamPartId)
                this.emit('unassigned', streamPartId)
            }
        }
    }

    private getStreamPartIds = async (streamId: StreamID): Promise<StreamPartID[]> => {
        try {
            const stream = await this.streamrClient.getStream(streamId)
            return stream.getStreamParts()
        } catch (err) {
            logger.warn('Ignore non-existing stream', { streamId, reason: err?.message })
            return []
        }
    }

    private concurrencyLimiter<T>(
        fn: (t: T) => Promise<void>
    ): (t: T) => void {
        return (t) => {
            this.concurrencyLimit(() => fn(t)).catch((err) => {
                logger.warn('Encountered error while processing event', { err })
            })
        }
    }
}
