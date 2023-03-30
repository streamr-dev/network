import { ConnectionLocker, keyFromPeerDescriptor, PeerDescriptor } from '@streamr/dht'
import { PeerList } from '../PeerList'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    HandshakeRpcClient,
    IHandshakeRpcClient, NetworkRpcClient
} from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    InterleaveNotice,
    StreamHandshakeRequest,
    StreamHandshakeResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { RemoteHandshaker } from './RemoteHandshaker'
import { HandshakerServer } from './HandshakerServer'

interface HandshakerConfig {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    connectionLocker: ConnectionLocker
    targetNeighbors: PeerList
    nearbyContactPool: PeerList
    randomContactPool: PeerList
    rpcCommunicator: RpcCommunicator
    N: number
    nodeName?: string
}

const logger = new Logger(module)

const PARALLEL_HANDSHAKE_COUNT = 2

export interface IHandshaker {
    attemptHandshakesOnContacts(excludedIds: string[]): Promise<string[]>
    getOngoingHandshakes(): Set<string>
}

export class Handshaker implements IHandshaker {

    private readonly ongoingHandshakes: Set<string> = new Set()
    private config: HandshakerConfig
    private readonly client: ProtoRpcClient<IHandshakeRpcClient>
    private readonly server: IHandshakeRpc

    constructor(config: HandshakerConfig) {
        this.config = config
        this.client = toProtoRpcClient(new HandshakeRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        this.server = new HandshakerServer({
            randomGraphId: this.config.randomGraphId,
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            targetNeighbors: this.config.targetNeighbors,
            connectionLocker: this.config.connectionLocker,
            ongoingHandshakes: this.ongoingHandshakes,
            N: this.config.N,
            handshakeWithInterleaving: (target: PeerDescriptor, senderId: string) => this.handshakeWithInterleaving(target, senderId),
            createRemoteHandshaker: (target: PeerDescriptor) => this.createRemoteHandshaker(target),
            createRemoteNode: (target: PeerDescriptor) => this.createRemoteNode(target)
        })
        this.config.rpcCommunicator.registerRpcNotification(InterleaveNotice, 'interleaveNotice',
            (req: InterleaveNotice, context) => this.server.interleaveNotice(req, context))
        this.config.rpcCommunicator.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake',
            (req: StreamHandshakeRequest, context) => this.server.handshake(req, context))
    }

    public async attemptHandshakesOnContacts(excludedIds: string[]): Promise<string[]> {
        if (this.config.targetNeighbors!.size() + this.ongoingHandshakes.size < this.config.N - 2) {
            logger.trace(`Attempting parallel handshakes with ${PARALLEL_HANDSHAKE_COUNT} targets`)
            return this.selectParallelTargetsAndHandshake(excludedIds)
        } else if (this.config.targetNeighbors!.size() + this.ongoingHandshakes.size < this.config.N) {
            logger.trace(`Attempting handshake with new target`)
            return this.selectNewTargetAndHandshake(excludedIds)
        }
        return excludedIds
    }

    private async selectParallelTargetsAndHandshake(excludedIds: string[]): Promise<string[]> {
        const exclude = excludedIds.concat(this.config.targetNeighbors.getStringIds())
        const targetNeighbors = this.selectParallelTargets(exclude)
        targetNeighbors.forEach((contact) => this.ongoingHandshakes.add(keyFromPeerDescriptor(contact.getPeerDescriptor())))
        return this.doParallelHandshakes(targetNeighbors, exclude)
    }

    private selectParallelTargets(excludedIds: string[]): RemoteHandshaker[] {
        const targetNeighbors = this.config.nearbyContactPool.getClosestAndFurthest(excludedIds)
        while (targetNeighbors.length < PARALLEL_HANDSHAKE_COUNT && this.config.randomContactPool.size(excludedIds) > 0) {
            const random = this.config.randomContactPool.getRandom(excludedIds)
            if (random) {
                targetNeighbors.push(random)
            }
        }
        return targetNeighbors.map((neighbor) => this.createRemoteHandshaker(neighbor.getPeerDescriptor()))
    }

    private async doParallelHandshakes(targets: RemoteHandshaker[], excludedIds: string[]): Promise<string[]> {
        const results = await Promise.allSettled(
            Array.from(targets.values()).map(async (target: RemoteHandshaker, i) => {
                const otherPeer = i === 0 ? targets[1] : targets[0]
                const otherPeerStringId = otherPeer ? keyFromPeerDescriptor(otherPeer.getPeerDescriptor()) : undefined
                return this.handshakeWithTarget(target, otherPeerStringId)
            })
        )
        results.map((res, i) => {
            if (res.status !== 'fulfilled' || !res.value) {
                excludedIds.push(keyFromPeerDescriptor(targets[i].getPeerDescriptor()))
            }
        })
        return excludedIds
    }

    private async selectNewTargetAndHandshake(excludedIds: string[]): Promise<string[]> {
        const exclude = excludedIds.concat(this.config.targetNeighbors.getStringIds())
        const targetNeighbor = this.config.nearbyContactPool.getClosest(exclude) || this.config.randomContactPool.getRandom(exclude)
        if (targetNeighbor) {
            const accepted = await this.handshakeWithTarget(this.createRemoteHandshaker(targetNeighbor.getPeerDescriptor()))
            if (!accepted) {
                excludedIds.push(keyFromPeerDescriptor(targetNeighbor.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(targetNeighbor: RemoteHandshaker, concurrentStringId?: string): Promise<boolean> {
        const targetStringId = keyFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetStringId)
        const result = await targetNeighbor.handshake(
            this.config.ownPeerDescriptor,
            this.config.targetNeighbors.getStringIds(),
            this.config.nearbyContactPool.getStringIds(),
            concurrentStringId
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(this.createRemoteNode(targetNeighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.randomGraphId)
        }
        if (result.interleaveTarget) {
            await this.handshakeWithInterleaving(result.interleaveTarget, targetStringId)
        }
        this.ongoingHandshakes.delete(targetStringId)
        return result.accepted
    }

    private async handshakeWithInterleaving(target: PeerDescriptor, interleavingFrom: string): Promise<boolean> {
        const targetNeighbor = new RemoteHandshaker(
            target,
            this.config.randomGraphId,
            this.client
        )
        const targetStringId = keyFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetStringId)
        const result = await targetNeighbor.handshake(
            this.config.ownPeerDescriptor,
            this.config.targetNeighbors.getStringIds(),
            this.config.nearbyContactPool.getStringIds(),
            undefined,
            true,
            interleavingFrom
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(this.createRemoteNode(targetNeighbor.getPeerDescriptor()))
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.randomGraphId)
        }
        this.ongoingHandshakes.delete(targetStringId)
        return result.accepted
    }

    private createRemoteHandshaker(targetPeerDescriptor: PeerDescriptor): RemoteHandshaker {
        return new RemoteHandshaker(targetPeerDescriptor, this.config.randomGraphId, this.client)
    }

    private createRemoteNode(targetPeerDescriptor: PeerDescriptor): RemoteRandomGraphNode {
        return new RemoteRandomGraphNode(
            targetPeerDescriptor,
            this.config.randomGraphId,
            toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator!.getRpcClientTransport()))
        )
    }

    public getOngoingHandshakes(): Set<string> {
        return this.ongoingHandshakes
    }

}
