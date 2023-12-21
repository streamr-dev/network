import { ConnectionLocker, DhtAddress, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NodeList } from '../NodeList'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { RpcCommunicator } from '@streamr/proto-rpc'
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
    targetNeighbors: NodeList
    nearbyNodeView: NodeList
    randomNodeView: NodeList
    rpcCommunicator: RpcCommunicator
    maxNeighborCount: number
    rpcRequestTimeout?: number
}

const logger = new Logger(module)

const PARALLEL_HANDSHAKE_COUNT = 2

export class Handshaker {

    private readonly ongoingHandshakes: Set<DhtAddress> = new Set()
    private config: HandshakerConfig
    private readonly rpcLocal: IHandshakeRpc

    constructor(config: HandshakerConfig) {
        this.config = config
        this.rpcLocal = new HandshakeRpcLocal({
            streamPartId: this.config.streamPartId,
            targetNeighbors: this.config.targetNeighbors,
            connectionLocker: this.config.connectionLocker,
            ongoingHandshakes: this.ongoingHandshakes,
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
        if (this.config.targetNeighbors.size() + this.ongoingHandshakes.size < this.config.maxNeighborCount - 2) {
            logger.trace(`Attempting parallel handshakes with ${PARALLEL_HANDSHAKE_COUNT} targets`)
            return this.selectParallelTargetsAndHandshake(excludedIds)
        } else if (this.config.targetNeighbors.size() + this.ongoingHandshakes.size < this.config.maxNeighborCount) {
            logger.trace(`Attempting handshake with new target`)
            return this.selectNewTargetAndHandshake(excludedIds)
        }
        return excludedIds
    }

    private async selectParallelTargetsAndHandshake(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        const exclude = excludedIds.concat(this.config.targetNeighbors.getIds())
        const targetNeighbors = this.selectParallelTargets(exclude)
        targetNeighbors.forEach((contact) => this.ongoingHandshakes.add(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())))
        return this.doParallelHandshakes(targetNeighbors, exclude)
    }

    private selectParallelTargets(excludedIds: DhtAddress[]): HandshakeRpcRemote[] {
        const targetNeighbors = this.config.nearbyNodeView.getFirstAndLast(excludedIds)
        while (targetNeighbors.length < PARALLEL_HANDSHAKE_COUNT && this.config.randomNodeView.size(excludedIds) > 0) {
            const random = this.config.randomNodeView.getRandom(excludedIds)
            if (random) {
                targetNeighbors.push(random)
            }
        }
        return targetNeighbors.map((neighbor) => this.createRpcRemote(neighbor.getPeerDescriptor()))
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
        const exclude = excludedIds.concat(this.config.targetNeighbors.getIds())
        const targetNeighbor = this.config.nearbyNodeView.getFirst(exclude) ?? this.config.randomNodeView.getRandom(exclude)
        if (targetNeighbor) {
            const accepted = await this.handshakeWithTarget(this.createRpcRemote(targetNeighbor.getPeerDescriptor()))
            if (!accepted) {
                excludedIds.push(getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(targetNeighbor: HandshakeRpcRemote, concurrentNodeId?: DhtAddress): Promise<boolean> {
        const targetNodeId = getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetNodeId)
        const result = await targetNeighbor.handshake(
            this.config.streamPartId,
            this.config.targetNeighbors.getIds(),
            concurrentNodeId
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(this.createDeliveryRpcRemote(targetNeighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.streamPartId)
        }
        if (result.interleaveTargetDescriptor) {
            await this.handshakeWithInterleaving(result.interleaveTargetDescriptor, targetNodeId)
        }
        this.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private async handshakeWithInterleaving(target: PeerDescriptor, interleaveSourceId: DhtAddress): Promise<boolean> {
        const targetNeighbor = this.createRpcRemote(target)
        const targetNodeId = getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetNodeId)
        const result = await targetNeighbor.handshake(
            this.config.streamPartId,
            this.config.targetNeighbors.getIds(),
            undefined,
            interleaveSourceId
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(this.createDeliveryRpcRemote(targetNeighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.streamPartId)
        }
        this.ongoingHandshakes.delete(targetNodeId)
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
        return this.ongoingHandshakes
    }

}
