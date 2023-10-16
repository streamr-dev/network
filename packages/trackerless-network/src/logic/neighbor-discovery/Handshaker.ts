import { ConnectionLocker, PeerDescriptor } from '@streamr/dht'
import { NodeList } from '../NodeList'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    HandshakeRpcClient,
    IHandshakeRpcClient, NetworkRpcClient
} from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    InterleaveNotice,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { RemoteHandshaker } from './RemoteHandshaker'
import { HandshakerServer } from './HandshakerServer'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { StreamPartID } from '@streamr/protocol'

interface HandshakerConfig {
    ownPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    connectionLocker: ConnectionLocker
    targetNeighbors: NodeList
    nearbyNodeView: NodeList
    randomNodeView: NodeList
    rpcCommunicator: RpcCommunicator
    N: number
}

const logger = new Logger(module)

const PARALLEL_HANDSHAKE_COUNT = 2

export interface IHandshaker {
    attemptHandshakesOnContacts(excludedIds: NodeID[]): Promise<NodeID[]>
    getOngoingHandshakes(): Set<string>
}

export class Handshaker implements IHandshaker {

    private readonly ongoingHandshakes: Set<NodeID> = new Set()
    private config: HandshakerConfig
    private readonly client: ProtoRpcClient<IHandshakeRpcClient>
    private readonly server: IHandshakeRpc

    constructor(config: HandshakerConfig) {
        this.config = config
        this.client = toProtoRpcClient(new HandshakeRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        this.server = new HandshakerServer({
            streamPartId: this.config.streamPartId,
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            targetNeighbors: this.config.targetNeighbors,
            connectionLocker: this.config.connectionLocker,
            ongoingHandshakes: this.ongoingHandshakes,
            N: this.config.N,
            handshakeWithInterleaving: (target: PeerDescriptor, senderId: NodeID) => this.handshakeWithInterleaving(target, senderId),
            createRemoteHandshaker: (target: PeerDescriptor) => this.createRemoteHandshaker(target),
            createRemoteNode: (target: PeerDescriptor) => this.createRemoteNode(target)
        })
        this.config.rpcCommunicator.registerRpcNotification(InterleaveNotice, 'interleaveNotice',
            (req: InterleaveNotice, context) => this.server.interleaveNotice(req, context))
        this.config.rpcCommunicator.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake',
            (req: StreamPartHandshakeRequest, context) => this.server.handshake(req, context))
    }

    public async attemptHandshakesOnContacts(excludedIds: NodeID[]): Promise<NodeID[]> {
        if (this.config.targetNeighbors.size() + this.ongoingHandshakes.size < this.config.N - 2) {
            logger.trace(`Attempting parallel handshakes with ${PARALLEL_HANDSHAKE_COUNT} targets`)
            return this.selectParallelTargetsAndHandshake(excludedIds)
        } else if (this.config.targetNeighbors.size() + this.ongoingHandshakes.size < this.config.N) {
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

    private selectParallelTargets(excludedIds: NodeID[]): RemoteHandshaker[] {
        const targetNeighbors = this.config.nearbyNodeView.getClosestAndFurthest(excludedIds)
        while (targetNeighbors.length < PARALLEL_HANDSHAKE_COUNT && this.config.randomNodeView.size(excludedIds) > 0) {
            const random = this.config.randomNodeView.getRandom(excludedIds)
            if (random) {
                targetNeighbors.push(random)
            }
        }
        return targetNeighbors.map((neighbor) => this.createRemoteHandshaker(neighbor.getPeerDescriptor()))
    }

    private async doParallelHandshakes(targets: RemoteHandshaker[], excludedIds: NodeID[]): Promise<NodeID[]> {
        const results = await Promise.allSettled(
            Array.from(targets.values()).map(async (target: RemoteHandshaker, i) => {
                const otherNode = i === 0 ? targets[1] : targets[0]
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
            const accepted = await this.handshakeWithTarget(this.createRemoteHandshaker(targetNeighbor.getPeerDescriptor()))
            if (!accepted) {
                excludedIds.push(getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(targetNeighbor: RemoteHandshaker, concurrentNodeId?: NodeID): Promise<boolean> {
        const targetNodeId = getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetNodeId)
        const result = await targetNeighbor.handshake(
            this.config.targetNeighbors.getIds(),
            concurrentNodeId
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(this.createRemoteNode(targetNeighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.streamPartId)
        }
        if (result.interleaveTargetDescriptor) {
            await this.handshakeWithInterleaving(result.interleaveTargetDescriptor, targetNodeId)
        }
        this.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private async handshakeWithInterleaving(target: PeerDescriptor, interleaveSourceId: NodeID): Promise<boolean> {
        const targetNeighbor = new RemoteHandshaker(
            this.config.ownPeerDescriptor,
            target,
            this.config.streamPartId,
            this.client
        )
        const targetNodeId = getNodeIdFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetNodeId)
        const result = await targetNeighbor.handshake(
            this.config.targetNeighbors.getIds(),
            undefined,
            interleaveSourceId
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(this.createRemoteNode(targetNeighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.streamPartId)
        }
        this.ongoingHandshakes.delete(targetNodeId)
        return result.accepted
    }

    private createRemoteHandshaker(targetPeerDescriptor: PeerDescriptor): RemoteHandshaker {
        return new RemoteHandshaker(this.config.ownPeerDescriptor, targetPeerDescriptor, this.config.streamPartId, this.client)
    }

    private createRemoteNode(targetPeerDescriptor: PeerDescriptor): RemoteRandomGraphNode {
        return new RemoteRandomGraphNode(
            this.config.ownPeerDescriptor,
            targetPeerDescriptor,
            this.config.streamPartId,
            toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        )
    }

    public getOngoingHandshakes(): Set<string> {
        return this.ongoingHandshakes
    }

}
