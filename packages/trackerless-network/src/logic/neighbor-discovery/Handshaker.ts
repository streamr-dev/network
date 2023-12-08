import { ConnectionLocker, PeerDescriptor } from '@streamr/dht'
import { NodeList } from '../NodeList'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    HandshakeRpcClient,
    IHandshakeRpcClient, DeliveryRpcClient
} from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { HandshakeRpcRemote } from './HandshakeRpcRemote'
import { HandshakeRpcLocal } from './HandshakeRpcLocal'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
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

export interface IHandshaker {
    attemptHandshakesOnContacts(excludedIds: NodeID[]): Promise<NodeID[]>
    getOngoingHandshakes(): Set<NodeID>
}

export class Handshaker implements IHandshaker {

    private readonly ongoingHandshakes: Set<NodeID> = new Set()
    private config: HandshakerConfig
    private readonly client: ProtoRpcClient<IHandshakeRpcClient>
    private readonly rpcLocal: IHandshakeRpc

    constructor(config: HandshakerConfig) {
        this.config = config
        this.client = toProtoRpcClient(new HandshakeRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        this.rpcLocal = new HandshakeRpcLocal({
            streamPartId: this.config.streamPartId,
            targetNeighbors: this.config.targetNeighbors,
            connectionLocker: this.config.connectionLocker,
            ongoingHandshakes: this.ongoingHandshakes,
            maxNeighborCount: this.config.maxNeighborCount,
            handshakeWithInterleaving: (target: PeerDescriptor, senderId: NodeID) => this.handshakeWithInterleaving(target, senderId),
            createRpcRemote: (target: PeerDescriptor) => this.createRpcRemote(target),
            createDeliveryRpcRemote: (target: PeerDescriptor) => this.createDeliveryRpcRemote(target)
        })
        this.config.rpcCommunicator.registerRpcMethod(InterleaveRequest, InterleaveResponse, 'interleaveRequest',
            (req: InterleaveRequest, context) => this.rpcLocal.interleaveRequest(req, context))
        this.config.rpcCommunicator.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake',
            (req: StreamPartHandshakeRequest, context) => this.rpcLocal.handshake(req, context))
    }

    async attemptHandshakesOnContacts(excludedIds: NodeID[]): Promise<NodeID[]> {
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

    private async selectParallelTargetsAndHandshake(excludedIds: NodeID[]): Promise<NodeID[]> {
        const exclude = excludedIds.concat(this.config.targetNeighbors.getIds())
        const targetNeighbors = this.selectParallelTargets(exclude)
        targetNeighbors.forEach((contact) => this.ongoingHandshakes.add(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())))
        return this.doParallelHandshakes(targetNeighbors, exclude)
    }

    private selectParallelTargets(excludedIds: NodeID[]): HandshakeRpcRemote[] {
        const targetNeighbors = this.config.nearbyNodeView.getClosestAndFurthest(excludedIds)
        while (targetNeighbors.length < PARALLEL_HANDSHAKE_COUNT && this.config.randomNodeView.size(excludedIds) > 0) {
            const random = this.config.randomNodeView.getRandom(excludedIds)
            if (random) {
                targetNeighbors.push(random)
            }
        }
        return targetNeighbors.map((neighbor) => this.createRpcRemote(neighbor.getPeerDescriptor()))
    }

    private async doParallelHandshakes(targets: HandshakeRpcRemote[], excludedIds: NodeID[]): Promise<NodeID[]> {
        const results = await Promise.allSettled(
            Array.from(targets.values()).map(async (target: HandshakeRpcRemote, i) => {
                const otherNode = i === 0 ? targets[1] : targets[0]
                // TODO better check (currently this condition is always true)
                const otherNodeId = otherNode ? getNodeIdFromPeerDescriptor(otherNode.getPeerDescriptor()) : undefined
                return this.handshakeWithTarget(target, otherNodeId)
            })
        )
        results.map((res, i) => {
            if (res.status !== 'fulfilled' || !res.value) {
                excludedIds.push(getNodeIdFromPeerDescriptor(targets[i].getPeerDescriptor()))
            }
        })
        return excludedIds
    }

    private async selectNewTargetAndHandshake(excludedIds: NodeID[]): Promise<NodeID[]> {
        const exclude = excludedIds.concat(this.config.targetNeighbors.getIds())
        const targetNeighbor = this.config.nearbyNodeView.getClosest(exclude) ?? this.config.randomNodeView.getRandom(exclude)
        if (targetNeighbor) {
            const accepted = await this.handshakeWithTarget(this.createRpcRemote(targetNeighbor.getPeerDescriptor()))
            if (!accepted) {
                excludedIds.push(getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(targetNeighbor: HandshakeRpcRemote, concurrentNodeId?: NodeID): Promise<boolean> {
        const targetNodeId = getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetNodeId)
        const result = await targetNeighbor.handshake(
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

    private async handshakeWithInterleaving(target: PeerDescriptor, interleaveSourceId: NodeID): Promise<boolean> {
        const targetNeighbor = new HandshakeRpcRemote(
            this.config.localPeerDescriptor,
            target,
            this.config.streamPartId,
            this.client,
            this.config.rpcRequestTimeout
        )
        const targetNodeId = getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetNodeId)
        const result = await targetNeighbor.handshake(
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
            this.config.streamPartId,
            this.client,
            this.config.rpcRequestTimeout
        )
    }

    private createDeliveryRpcRemote(targetPeerDescriptor: PeerDescriptor): DeliveryRpcRemote {
        return new DeliveryRpcRemote(
            this.config.localPeerDescriptor,
            targetPeerDescriptor,
            this.config.streamPartId,
            toProtoRpcClient(new DeliveryRpcClient(this.config.rpcCommunicator.getRpcClientTransport())),
            this.config.rpcRequestTimeout
        )
    }

    getOngoingHandshakes(): Set<NodeID> {
        return this.ongoingHandshakes
    }

}
