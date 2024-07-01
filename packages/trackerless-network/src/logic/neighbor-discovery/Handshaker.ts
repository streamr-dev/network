import { DhtAddress, PeerDescriptor, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NodeList } from '../NodeList'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import {
    ContentDeliveryRpcClient, HandshakeRpcClient
} from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { HandshakeRpcRemote, INTERLEAVE_REQUEST_TIMEOUT } from './HandshakeRpcRemote'
import { HandshakeRpcLocal } from './HandshakeRpcLocal'
import { StreamPartID } from '@streamr/protocol'

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

const logger = new Logger(module)

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
        const neighbors = this.selectParallelTargets(exclude)
        neighbors.forEach((contact) => this.options.ongoingHandshakes.add(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())))
        return this.doParallelHandshakes(neighbors, exclude)
    }

    private selectParallelTargets(excludedIds: DhtAddress[]): HandshakeRpcRemote[] {
        const neighbors: Map<DhtAddress, ContentDeliveryRpcRemote> = new Map()
        // First add the closest left and then right contacts from the ring if possible.
        const left = this.options.leftNodeView.getFirst([...excludedIds, ...Array.from(neighbors.keys())] as DhtAddress[])
        const right = this.options.rightNodeView.getFirst([...excludedIds, ...Array.from(neighbors.keys())] as DhtAddress[])
        if (left) {
            neighbors.set(getNodeIdFromPeerDescriptor(left.getPeerDescriptor()), left)
        }
        if (right) {
            neighbors.set(getNodeIdFromPeerDescriptor(right.getPeerDescriptor()), right)
        }
        // If there is still room add the closest contact based on the kademlia metric
        if (neighbors.size < PARALLEL_HANDSHAKE_COUNT) {
            const first = this.options.nearbyNodeView.getFirst([...excludedIds, ...Array.from(neighbors.keys())] as DhtAddress[])
            if (first) {
                neighbors.set(getNodeIdFromPeerDescriptor(first.getPeerDescriptor()), first)
            }
        }
        const getExcludedFromRandomView = () => [
            ...excludedIds,
            ...Array.from(neighbors.values()).map((neighbor) => getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor()))
        ]
        // If there is still room add a random contact until PARALLEL_HANDSHAKE_COUNT is reached
        while (
            neighbors.size < PARALLEL_HANDSHAKE_COUNT 
            && this.options.randomNodeView.size(getExcludedFromRandomView()) > 0
        ) {
            const random = this.options.randomNodeView.getRandom([...excludedIds, ...Array.from(neighbors.keys())] as DhtAddress[])
            if (random) {
                neighbors.set(getNodeIdFromPeerDescriptor(random.getPeerDescriptor()), random)
            }
        }
        return Array.from(neighbors.values()).map((neighbor) => this.createRpcRemote(neighbor.getPeerDescriptor()))
    }

    private async doParallelHandshakes(targets: HandshakeRpcRemote[], excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const results = await Promise.allSettled(
            Array.from(targets.values()).map(async (target: HandshakeRpcRemote, i) => {
                const otherNode = i === 0 ? targets[1] : targets[0]
                // TODO better check (currently this condition is always true)
                const otherNodeId = otherNode ? getNodeIdFromPeerDescriptor(otherNode.getPeerDescriptor()) : undefined
                return this.handshakeWithTarget(target, otherNodeId)
            })
        )
        results.forEach((res, i) => {
            if (res.status !== 'fulfilled' || !res.value) {
                excludedIds.push(getNodeIdFromPeerDescriptor(targets[i].getPeerDescriptor()))
            }
        })
        return excludedIds
    }

    private async selectNewTargetAndHandshake(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const exclude = excludedIds.concat(this.options.neighbors.getIds())
        const neighbor = this.options.leftNodeView.getFirst(exclude) 
            ?? this.options.rightNodeView.getFirst(exclude)
            ?? this.options.nearbyNodeView.getFirst(exclude)
            ?? this.options.randomNodeView.getRandom(exclude)
        if (neighbor) {
            const accepted = await this.handshakeWithTarget(this.createRpcRemote(neighbor.getPeerDescriptor()))
            if (!accepted) {
                excludedIds.push(getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(neighbor: HandshakeRpcRemote, concurrentNodeId?: DhtAddress): Promise<boolean> {
        const targetNodeId = getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor())
        this.options.ongoingHandshakes.add(targetNodeId)
        const result = await neighbor.handshake(
            this.options.streamPartId,
            this.options.neighbors.getIds(),
            concurrentNodeId
        )
        if (result.accepted) {
            this.options.neighbors.add(this.createContentDeliveryRpcRemote(neighbor.getPeerDescriptor()))
        }
        if (result.interleaveTargetDescriptor) {
            await this.handshakeWithInterleaving(result.interleaveTargetDescriptor, targetNodeId)
        }
        this.options.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private async handshakeWithInterleaving(target: PeerDescriptor, remoteNodeId: DhtAddress): Promise<boolean> {
        const neighbor = this.createRpcRemote(target)
        const targetNodeId = getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor())
        this.options.ongoingHandshakes.add(targetNodeId)
        const result = await neighbor.handshake(
            this.options.streamPartId,
            this.options.neighbors.getIds(),
            undefined,
            remoteNodeId
        )
        if (result.accepted) {
            this.options.neighbors.add(this.createContentDeliveryRpcRemote(neighbor.getPeerDescriptor()))
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
