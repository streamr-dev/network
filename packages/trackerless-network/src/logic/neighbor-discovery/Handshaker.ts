import { ConnectionLocker, DhtAddress, PeerDescriptor, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NodeList } from '../NodeList'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import {
    DeliveryRpcClient, HandshakeRpcClient
} from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { HandshakeRpcRemote, INTERLEAVE_REQUEST_TIMEOUT } from './HandshakeRpcRemote'
import { HandshakeRpcLocal } from './HandshakeRpcLocal'
import { StreamPartID } from '@streamr/protocol'

interface HandshakerConfig {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    connectionLocker: ConnectionLocker
    neighbors: NodeList
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

    private config: HandshakerConfig
    private readonly rpcLocal: IHandshakeRpc

    constructor(config: HandshakerConfig) {
        this.config = config
        this.rpcLocal = new HandshakeRpcLocal({
            streamPartId: this.config.streamPartId,
            neighbors: this.config.neighbors,
            connectionLocker: this.config.connectionLocker,
            ongoingHandshakes: this.config.ongoingHandshakes,
            ongoingInterleaves: new Set(),
            maxNeighborCount: this.config.maxNeighborCount,
            handshakeWithInterleaving: (target: PeerDescriptor, senderId: DhtAddress) => this.handshakeWithInterleaving(target, senderId),
            createRpcRemote: (target: PeerDescriptor) => this.createRpcRemote(target),
            createDeliveryRpcRemote: (target: PeerDescriptor) => this.createDeliveryRpcRemote(target)
        })
        this.config.rpcCommunicator.registerRpcMethod(InterleaveRequest, InterleaveResponse, 'interleaveRequest',
            (req: InterleaveRequest, context) => this.rpcLocal.interleaveRequest(req, context), { timeout: INTERLEAVE_REQUEST_TIMEOUT })
        this.config.rpcCommunicator.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake',
            (req: StreamPartHandshakeRequest, context) => this.rpcLocal.handshake(req, context))
    }

    async attemptHandshakesOnContacts(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        // TODO use config option or named constant? or why the value 2?
        if (this.config.neighbors.size() + this.config.ongoingHandshakes.size < this.config.maxNeighborCount - 2) {
            logger.trace(`Attempting parallel handshakes with ${PARALLEL_HANDSHAKE_COUNT} targets`)
            return this.selectParallelTargetsAndHandshake(excludedIds)
        } else if (this.config.neighbors.size() + this.config.ongoingHandshakes.size < this.config.maxNeighborCount) {
            logger.trace(`Attempting handshake with new target`)
            return this.selectNewTargetAndHandshake(excludedIds)
        }
        return excludedIds
    }

    private async selectParallelTargetsAndHandshake(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const exclude = excludedIds.concat(this.config.neighbors.getIds())
        const neighbors = this.selectParallelTargets(exclude)
        neighbors.forEach((contact) => this.config.ongoingHandshakes.add(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())))
        return this.doParallelHandshakes(neighbors, exclude)
    }

    private selectParallelTargets(excludedIds: DhtAddress[]): HandshakeRpcRemote[] {
        const neighbors = this.config.nearbyNodeView.getFirstAndLast(excludedIds)
        const getExcludedFromRandomView = () => [
            ...excludedIds,
            ...neighbors.map((neighbor) => getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor()))
        ]
        while (
            neighbors.length < PARALLEL_HANDSHAKE_COUNT 
            && this.config.randomNodeView.size(getExcludedFromRandomView()) > 0
        ) {
            const random = this.config.randomNodeView.getRandom(getExcludedFromRandomView())!
            neighbors.push(random)
        }
        return neighbors.map((neighbor) => this.createRpcRemote(neighbor.getPeerDescriptor()))
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
        const exclude = excludedIds.concat(this.config.neighbors.getIds())
        const neighbor = this.config.nearbyNodeView.getFirst(exclude) ?? this.config.randomNodeView.getRandom(exclude)
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
        this.config.ongoingHandshakes.add(targetNodeId)
        const result = await neighbor.handshake(
            this.config.streamPartId,
            this.config.neighbors.getIds(),
            concurrentNodeId
        )
        if (result.accepted) {
            this.config.neighbors.add(this.createDeliveryRpcRemote(neighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(neighbor.getPeerDescriptor(), this.config.streamPartId)
        }
        if (result.interleaveTargetDescriptor) {
            await this.handshakeWithInterleaving(result.interleaveTargetDescriptor, targetNodeId)
        }
        this.config.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private async handshakeWithInterleaving(target: PeerDescriptor, interleaveSourceId: DhtAddress): Promise<boolean> {
        const neighbor = this.createRpcRemote(target)
        const targetNodeId = getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor())
        this.config.ongoingHandshakes.add(targetNodeId)
        const result = await neighbor.handshake(
            this.config.streamPartId,
            this.config.neighbors.getIds(),
            undefined,
            interleaveSourceId
        )
        if (result.accepted) {
            this.config.neighbors.add(this.createDeliveryRpcRemote(neighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(neighbor.getPeerDescriptor(), this.config.streamPartId)
        }
        this.config.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private createRpcRemote(targetPeerDescriptor: PeerDescriptor): HandshakeRpcRemote {
        return new HandshakeRpcRemote(
            this.config.localPeerDescriptor,
            targetPeerDescriptor,
            this.config.rpcCommunicator,
            HandshakeRpcClient,
            this.config.rpcRequestTimeout
        )
    }

    private createDeliveryRpcRemote(targetPeerDescriptor: PeerDescriptor): DeliveryRpcRemote {
        return new DeliveryRpcRemote(
            this.config.localPeerDescriptor,
            targetPeerDescriptor,
            this.config.rpcCommunicator,
            DeliveryRpcClient,
            this.config.rpcRequestTimeout
        )
    }

    getOngoingHandshakes(): Set<DhtAddress> {
        return this.config.ongoingHandshakes
    }

}
