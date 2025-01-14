import { DhtAddress } from '@streamr/dht'
import { Logger, StreamID, StreamPartID } from '@streamr/utils'
import { NetworkPeerDescriptor } from '@streamr/sdk'
import EventEmitter3 from 'eventemitter3'
import pLimit from 'p-limit'
import { ConsistentHashRing } from './ConsistentHashRing'
import { MaintainTopologyHelperEvents } from './MaintainTopologyHelper'
import { OperatorFleetState } from './OperatorFleetState'

const logger = new Logger(module)

export interface StreamPartAssignmentEvents {
    assigned(streamPartId: StreamPartID): void
    unassigned(streamPartId: StreamPartID): void
}

export class StreamPartAssignments extends EventEmitter3<StreamPartAssignmentEvents> {
    private readonly assignments = new Map<StreamPartID, DhtAddress[]>()
    private readonly myStreamParts = new Set<StreamPartID>()
    private readonly concurrencyLimit = pLimit(1)
    private readonly consistentHashRing: ConsistentHashRing
    private readonly myNodeId: DhtAddress
    private readonly getStreamParts: (streamId: StreamID) => Promise<StreamPartID[]>
    private readonly operatorFleetState: OperatorFleetState
    private readonly maintainTopologyHelper: EventEmitter3<MaintainTopologyHelperEvents>

    constructor(
        myNodeId: DhtAddress,
        redundancyFactor: number,
        getStreamParts: (streamId: StreamID) => Promise<StreamPartID[]>,
        operatorFleetState: OperatorFleetState,
        maintainTopologyHelper: EventEmitter3<MaintainTopologyHelperEvents>
    ) {
        super()
        this.myNodeId = myNodeId
        this.getStreamParts = getStreamParts
        this.operatorFleetState = operatorFleetState
        this.maintainTopologyHelper = maintainTopologyHelper
        this.consistentHashRing = new ConsistentHashRing(redundancyFactor)
        this.consistentHashRing.add(myNodeId)
        this.operatorFleetState.on('added', this.nodeAdded)
        this.operatorFleetState.on('removed', this.nodeRemoved)
        this.maintainTopologyHelper.on('addStakedStreams', this.streamsStaked)
        this.maintainTopologyHelper.on('removeStakedStream', this.streamUnstaked)
    }

    getMyStreamParts(): StreamPartID[] {
        return Array.from(this.myStreamParts)
    }

    getAssignedNodesForStreamPart(streamPartId: StreamPartID): NetworkPeerDescriptor[] {
        const nodeList = this.assignments.get(streamPartId) ?? []
        const descriptorList = []
        for (const nodeId of nodeList) {
            const descriptor = this.operatorFleetState.getPeerDescriptor(nodeId)
            if (descriptor !== undefined) {
                descriptorList.push(descriptor)
            }
        }
        return descriptorList
    }

    private nodeAdded = this.concurrencyLimiter(async (nodeId: DhtAddress): Promise<void> => {
        if (nodeId === this.myNodeId) {
            return
        }
        this.consistentHashRing.add(nodeId)
        this.recalculateAssignments(`nodeAdded:${nodeId}`)
    })

    private nodeRemoved = this.concurrencyLimiter(async (nodeId: DhtAddress): Promise<void> => {
        if (nodeId === this.myNodeId) {
            return
        }
        this.consistentHashRing.remove(nodeId)
        this.recalculateAssignments(`nodeRemoved:${nodeId}`)
    })

    private streamsStaked = this.concurrencyLimiter(async (streamIds: StreamID[]): Promise<void> => {
        const streamPartIds = (await Promise.all(streamIds.map(this.getStreamPartIds))).flat()
        for (const streamPartId of streamPartIds) {
            this.assignments.set(streamPartId, [])
        }
        // TODO: optimize; calculate efficiently by only considering added stream parts
        this.recalculateAssignments(`streamsStaked:${streamIds.join()}`)
    })

    private streamUnstaked = this.concurrencyLimiter(async (streamId: StreamID): Promise<void> => {
        const streamPartIds = await this.getStreamPartIds(streamId)
        for (const streamPartId of streamPartIds) {
            this.assignments.delete(streamPartId)
        }
        // TODO: optimize; calculate efficiently by only considering removed stream parts
        this.recalculateAssignments(`streamUnstaked:${streamId}`)
    })

    private recalculateAssignments(context: string): void {
        const assigned: StreamPartID[] = []
        const unassigned: StreamPartID[] = []
        for (const streamPartId of this.assignments.keys()) {
            const nodeList = this.consistentHashRing.get(streamPartId)
            this.assignments.set(streamPartId, nodeList)
            if (nodeList.includes(this.myNodeId) && !this.myStreamParts.has(streamPartId)) {
                assigned.push(streamPartId)
                this.myStreamParts.add(streamPartId)
                this.emit('assigned', streamPartId)
            }
        }
        for (const streamPartId of this.myStreamParts) {
            if (
                !this.assignments.has(streamPartId) ||
                !this.consistentHashRing.get(streamPartId).includes(this.myNodeId)
            ) {
                unassigned.push(streamPartId)
                this.myStreamParts.delete(streamPartId)
                this.emit('unassigned', streamPartId)
            }
        }
        logger.info('Recalculate assignments', { assigned, unassigned, context })
    }

    private getStreamPartIds = async (streamId: StreamID): Promise<StreamPartID[]> => {
        try {
            return await this.getStreamParts(streamId)
        } catch (err) {
            logger.warn('Ignore non-existing stream', { streamId, reason: err?.message })
            return []
        }
    }

    private concurrencyLimiter<T>(fn: (t: T) => Promise<void>): (t: T) => void {
        return (t) => {
            this.concurrencyLimit(() => fn(t)).catch((err) => {
                logger.warn('Encountered error while processing event', { err })
            })
        }
    }
}
