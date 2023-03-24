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
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../../proto/google/protobuf/empty'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { RemoteHandshaker } from './RemoteHandshaker'

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

interface HandshakerFunc {
    attemptHandshakesOnContacts(excludedIds: string[]): Promise<string[]>
    interleaveHandshake(targetNeighbor: RemoteHandshaker, interleavingFrom: string): Promise<boolean>
    handleRequest(request: StreamHandshakeRequest, requester: RemoteHandshaker): StreamHandshakeResponse
    getOngoingHandshakes(): Set<string>
}

export interface IHandshaker extends IHandshakeRpc, HandshakerFunc {}

export class Handshaker implements IHandshaker {

    private readonly ongoingHandshakes: Set<string> = new Set()
    private config: HandshakerConfig
    private readonly client: ProtoRpcClient<IHandshakeRpcClient>

    constructor(config: HandshakerConfig) {
        this.config = config
        this.client = toProtoRpcClient(new HandshakeRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        this.config.rpcCommunicator.registerRpcNotification(InterleaveNotice, 'interleaveNotice',
            (req: InterleaveNotice, context) => this.interleaveNotice(req, context))
        this.config.rpcCommunicator.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake',
            (req: StreamHandshakeRequest, context) => this.handshake(req, context))
    }

    public async attemptHandshakesOnContacts(excludedIds: string[]): Promise<string[]> {
        if (this.config.targetNeighbors!.size() + this.getOngoingHandshakes().size < this.config.N - 2) {
            return this.selectParallelTargetsAndHandshake(excludedIds)
        } else if (this.config.targetNeighbors!.size() + this.getOngoingHandshakes().size < this.config.N) {
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
            const interleaveTarget = new RemoteHandshaker(
                result.interleaveTarget,
                this.config.randomGraphId,
                this.client
            )
            await this.interleaveHandshake(interleaveTarget, targetStringId)
        }
        this.ongoingHandshakes.delete(targetStringId)
        return result.accepted
    }

    public async interleaveHandshake(targetNeighbor: RemoteHandshaker, interleavingFrom: string): Promise<boolean> {
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

    public handleRequest(request: StreamHandshakeRequest, requester: RemoteHandshaker): StreamHandshakeResponse {
        if (this.config.targetNeighbors!.hasPeer(requester.getPeerDescriptor())
            || this.getOngoingHandshakes().has(keyFromPeerDescriptor(requester.getPeerDescriptor()))
        ) {
            return this.respondWithAccepted(request, requester)
        } else if (this.config.targetNeighbors!.size() + this.getOngoingHandshakes().size < this.config.N) {
            return this.respondWithAccepted(request, requester)
        } else if (this.config.targetNeighbors!.size([request.interleavingFrom!]) >= 2) {
            return this.respondWithInterleaveRequest(request, requester)
        } else {
            return this.respondWithUnaccepted(request)
        }
    }

    private respondWithInterleaveRequest(request: StreamHandshakeRequest, requester: RemoteHandshaker): StreamHandshakeResponse {
        const exclude = request.neighbors
        exclude.push(request.senderId)
        exclude.push(request.interleavingFrom!)
        const furthest = this.config.targetNeighbors.getFurthest(exclude)
        const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined
        if (furthest) {
            const remote = this.createRemoteHandshaker(furthest.getPeerDescriptor())
            remote.interleaveNotice(this.config.ownPeerDescriptor, request.senderDescriptor!)
            this.config.targetNeighbors.remove(furthest.getPeerDescriptor())
            this.config.connectionLocker.unlockConnection(furthestPeerDescriptor!, this.config.randomGraphId)
        } else {
            logger.trace('furthest was falsy')
        }
        this.config.targetNeighbors.add(this.createRemoteNode(requester.getPeerDescriptor()))
        const res: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: true,
            interleaveTarget: furthestPeerDescriptor
        }
        this.config.connectionLocker.lockConnection(request.senderDescriptor!, this.config.randomGraphId)
        return res
    }

    // eslint-disable-next-line class-methods-use-this
    private respondWithUnaccepted(request: StreamHandshakeRequest): StreamHandshakeResponse {
        const res: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: false
        }
        return res
    }

    private respondWithAccepted(request: StreamHandshakeRequest, requester: RemoteHandshaker): StreamHandshakeResponse {
        const res: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: true
        }
        this.config.targetNeighbors.add(this.createRemoteNode(requester.getPeerDescriptor()))
        this.config.connectionLocker.lockConnection(request.senderDescriptor!, this.config.randomGraphId)
        return res
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

    // INetworkRpc server method
    async handshake(request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> {
        const requester = new RemoteHandshaker(
            request.senderDescriptor!,
            request.randomGraphId,
            this.client
        )
        return this.handleRequest(request, requester)
    }

    // INetworkRpc server method
    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            if (this.config.targetNeighbors.hasPeerWithStringId(message.senderId)) {
                const senderDescriptor = this.config.targetNeighbors.getNeighborWithId(message.senderId)!.getPeerDescriptor()
                this.config.connectionLocker.unlockConnection(senderDescriptor, this.config.randomGraphId)
                this.config.targetNeighbors.remove(senderDescriptor)
            }

            const newContact = new RemoteHandshaker(
                message.interleaveTarget!,
                this.config.randomGraphId,
                toProtoRpcClient(new HandshakeRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
            this.interleaveHandshake(newContact, message.senderId).catch((e) => {
                logger.error(e)
            })
        }
        return Empty
    }

}
