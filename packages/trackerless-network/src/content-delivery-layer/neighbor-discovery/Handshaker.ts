import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import {
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import {
    ContentDeliveryRpcClient, HandshakeRpcClient
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { NodeList } from '../NodeList'
import { HandshakeRpcLocal } from './HandshakeRpcLocal'
import { HandshakeRpcRemote, INTERLEAVE_REQUEST_TIMEOUT } from './HandshakeRpcRemote'

interface HandshakerOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    neighbors: NodeList
    leftNodeView: NodeList
    rightNodeView: NodeList
    nearbyNodeView: NodeList
    randomNodeView: NodeList
    rpcCommunicator: ListeningRpcCommunicator
    maxNeighborCount: number
    ongoingHandshakes: Set<DhtAddress>
    rpcRequestTimeout?: number
}

const logger = new Logger('Handshaker')

const PARALLEL_HANDSHAKE_COUNT = 2

export class Handshaker {

    private options: HandshakerOptions
    private readonly rpcLocal: HandshakeRpcLocal

    constructor(options: HandshakerOptions) {
        this.options = options
        this.rpcLocal = new HandshakeRpcLocal({
            streamPartId: this.options.streamPartId,
            neighbors: this.options.neighbors,
            ongoingHandshakes: this.options.ongoingHandshakes,
            ongoingInterleaves: new Set(),
            maxNeighborCount: this.options.maxNeighborCount,
            handshakeWithInterleaving: (target: PeerDescriptor, remoteNodeId: DhtAddress) => this.handshakeWithInterleaving(target, remoteNodeId),
            createRpcRemote: (target: PeerDescriptor) => this.createRpcRemote(target),
            createContentDeliveryRpcRemote: (target: PeerDescriptor) => this.createContentDeliveryRpcRemote(target)
        })
        this.options.rpcCommunicator.registerRpcMethod(InterleaveRequest, InterleaveResponse, 'interleaveRequest',
            (req: InterleaveRequest, context) => this.rpcLocal.interleaveRequest(req, context), { timeout: INTERLEAVE_REQUEST_TIMEOUT })
        this.options.rpcCommunicator.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake',
            (req: StreamPartHandshakeRequest, context) => this.rpcLocal.handshake(req, context))
    }

    async attemptHandshakesOnContacts(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        // TODO use options option or named constant? or why the value 2?
        if (this.options.neighbors.size() + this.options.ongoingHandshakes.size < this.options.maxNeighborCount - 2) {
            logger.trace(`Attempting parallel handshakes with ${PARALLEL_HANDSHAKE_COUNT} targets`)
            return this.selectParallelTargetsAndHandshake(excludedIds)
        } else if (this.options.neighbors.size() + this.options.ongoingHandshakes.size < this.options.maxNeighborCount) {
            logger.trace(`Attempting handshake with new target`)
            return this.selectNewTargetAndHandshake(excludedIds)
        }
        return excludedIds
    }

    private async selectParallelTargetsAndHandshake(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const exclude = excludedIds.concat(this.options.neighbors.getIds())
        const targets = this.selectParallelTargets(exclude)
        targets.forEach((contact) => this.options.ongoingHandshakes.add(toNodeId(contact.getPeerDescriptor())))
        return this.doParallelHandshakes(targets, exclude)
    }

    private selectParallelTargets(excludedIds: DhtAddress[]): HandshakeRpcRemote[] {
        const targets = new Map<DhtAddress, ContentDeliveryRpcRemote>()
        const getExcludedIds = () => [...excludedIds, ...Array.from(targets.keys())]

        // Step 1: If no neighbors, try to find a WebSocket node first
        if (this.options.neighbors.size() === 0) {
            const wsNode = this.options.nearbyNodeView.getFirst(getExcludedIds(), true)
            if (wsNode) {
                const wsNodeId = toNodeId(wsNode.getPeerDescriptor())
                targets.set(wsNodeId, wsNode)
            }
        }

        // Step 2: Add left and right contacts from the ring
        const left = this.options.leftNodeView.getFirst(getExcludedIds())
        const right = this.options.rightNodeView.getFirst(getExcludedIds())
        if (left) {
            targets.set(toNodeId(left.getPeerDescriptor()), left)
        }
        if (right) {
            targets.set(toNodeId(right.getPeerDescriptor()), right)
        }
        // Step 3: Add closest contact based on Kademlia metric if needed
        if (targets.size < PARALLEL_HANDSHAKE_COUNT) {
            const closest = this.options.nearbyNodeView.getFirst(getExcludedIds())
            if (closest) {
                targets.set(toNodeId(closest.getPeerDescriptor()), closest)
            }
        }

        // Step 4: Fill remaining slots with random contacts
        while (targets.size < PARALLEL_HANDSHAKE_COUNT) {
            const random = this.options.randomNodeView.getRandom(getExcludedIds())
            if (!random) {
                break
            }
            targets.set(toNodeId(random.getPeerDescriptor()), random)
        }

        return Array.from(targets.values()).map((neighbor) => 
            this.createRpcRemote(neighbor.getPeerDescriptor())
        )
    }

    private async doParallelHandshakes(targets: HandshakeRpcRemote[], excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const results = await Promise.allSettled(
            Array.from(targets.values()).map(async (target: HandshakeRpcRemote, i) => {
                const otherNode = i === 0 ? targets[1] : targets[0]
                // TODO better check (currently this condition is always true)
                const otherNodeId = otherNode ? toNodeId(otherNode.getPeerDescriptor()) : undefined
                return this.handshakeWithTarget(target, otherNodeId)
            })
        )
        results.forEach((res, i) => {
            if (res.status !== 'fulfilled' || !res.value) {
                excludedIds.push(toNodeId(targets[i].getPeerDescriptor()))
            }
        })
        return excludedIds
    }

    private async selectNewTargetAndHandshake(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const exclude = excludedIds.concat(this.options.neighbors.getIds())
        const target = this.options.leftNodeView.getFirst(exclude) 
            ?? this.options.rightNodeView.getFirst(exclude)
            ?? this.options.nearbyNodeView.getFirst(exclude)
            ?? this.options.randomNodeView.getRandom(exclude)
        if (target) {
            const accepted = await this.handshakeWithTarget(this.createRpcRemote(target.getPeerDescriptor()))
            if (!accepted) {
                excludedIds.push(toNodeId(target.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(target: HandshakeRpcRemote, concurrentNodeId?: DhtAddress): Promise<boolean> {
        const targetNodeId = toNodeId(target.getPeerDescriptor())
        this.options.ongoingHandshakes.add(targetNodeId)
        const result = await target.handshake(
            this.options.streamPartId,
            this.options.neighbors.getIds(),
            concurrentNodeId
        )
        if (result.accepted) {
            this.options.neighbors.add(this.createContentDeliveryRpcRemote(target.getPeerDescriptor()))
        }
        if (result.interleaveTargetDescriptor) {
            await this.handshakeWithInterleaving(result.interleaveTargetDescriptor, targetNodeId)
        }
        this.options.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private async handshakeWithInterleaving(target: PeerDescriptor, remoteNodeId: DhtAddress): Promise<boolean> {
        const remote = this.createRpcRemote(target)
        const targetNodeId = toNodeId(remote.getPeerDescriptor())
        this.options.ongoingHandshakes.add(targetNodeId)
        const result = await remote.handshake(
            this.options.streamPartId,
            this.options.neighbors.getIds(),
            undefined,
            remoteNodeId
        )
        if (result.accepted) {
            this.options.neighbors.add(this.createContentDeliveryRpcRemote(remote.getPeerDescriptor()))
        }
        this.options.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private createRpcRemote(targetPeerDescriptor: PeerDescriptor): HandshakeRpcRemote {
        return new HandshakeRpcRemote(
            this.options.localPeerDescriptor,
            targetPeerDescriptor,
            this.options.rpcCommunicator,
            HandshakeRpcClient,
            this.options.rpcRequestTimeout
        )
    }

    private createContentDeliveryRpcRemote(targetPeerDescriptor: PeerDescriptor): ContentDeliveryRpcRemote {
        return new ContentDeliveryRpcRemote(
            this.options.localPeerDescriptor,
            targetPeerDescriptor,
            this.options.rpcCommunicator,
            ContentDeliveryRpcClient,
            this.options.rpcRequestTimeout
        )
    }

    getOngoingHandshakes(): Set<DhtAddress> {
        return this.options.ongoingHandshakes
    }

}
