import { ConnectionLocker, keyFromPeerDescriptor, PeerDescriptor } from '@streamr/dht'
import { PeerList } from './PeerList'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { StreamHandshakeRequest, StreamHandshakeResponse } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'

interface HandshakerParams {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    connectionLocker: ConnectionLocker
    targetNeighbors: PeerList
    nearbyContactPool: PeerList
    randomContactPool: PeerList
    protoRpcClient: ProtoRpcClient<NetworkRpcClient>
    N: number
    nodeName?: string
}

const logger = new Logger(module)

const PARALLEL_HANDSHAKE_COUNT = 2

export class Handshaker {

    private readonly ongoingHandshakes: Set<string> = new Set()
    private config: HandshakerParams

    constructor(params: HandshakerParams) {
        this.config = params
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

    private selectParallelTargets(excludedIds: string[]): RemoteRandomGraphNode[] {
        const targetNeighbors = this.config.nearbyContactPool.getClosestAndFurthest(excludedIds)
        while (targetNeighbors.length < PARALLEL_HANDSHAKE_COUNT && this.config.randomContactPool.size(excludedIds) > 0) {
            const random = this.config.randomContactPool.getRandom(excludedIds)
            if (random) {
                targetNeighbors.push(random)
            }
        }
        return targetNeighbors
    }

    private async doParallelHandshakes(targets: RemoteRandomGraphNode[], excludedIds: string[]): Promise<string[]> {
        const results = await Promise.allSettled(
            Array.from(targets.values()).map(async (target: RemoteRandomGraphNode, i) => {
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
            const accepted = await this.handshakeWithTarget(targetNeighbor)
            if (!accepted) {
                excludedIds.push(keyFromPeerDescriptor(targetNeighbor.getPeerDescriptor()))
            }
        }
        return excludedIds
    }

    private async handshakeWithTarget(targetNeighbor: RemoteRandomGraphNode, concurrentStringId?: string): Promise<boolean> {
        const targetStringId = keyFromPeerDescriptor(targetNeighbor.getPeerDescriptor())
        this.ongoingHandshakes.add(targetStringId)
        const result = await targetNeighbor.handshake(
            this.config.ownPeerDescriptor,
            this.config.targetNeighbors.getStringIds(),
            this.config.nearbyContactPool.getStringIds(),
            concurrentStringId
        )
        if (result.accepted) {
            this.config.targetNeighbors.add(targetNeighbor)
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.randomGraphId)
        }
        if (result.interleaveTarget) {
            const interleaveTarget = new RemoteRandomGraphNode(
                result.interleaveTarget,
                this.config.randomGraphId,
                this.config.protoRpcClient
            )
            await this.interleaveHandshake(interleaveTarget, targetStringId)
        }
        this.ongoingHandshakes.delete(targetStringId)
        return result.accepted
    }

    public async interleaveHandshake(targetNeighbor: RemoteRandomGraphNode, interleavingFrom: string): Promise<boolean> {
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
            this.config.targetNeighbors.add(targetNeighbor)
            this.config.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.config.randomGraphId)
        }
        this.ongoingHandshakes.delete(targetStringId)
        return result.accepted
    }

    public handleRequest(request: StreamHandshakeRequest, requester: RemoteRandomGraphNode): StreamHandshakeResponse {
        if (this.config.targetNeighbors!.hasPeer(requester.getPeerDescriptor())
            || this.getOngoingHandshakes().has(keyFromPeerDescriptor(requester.getPeerDescriptor()))
        ) {
            return this.respondWithAccepted(request, requester)
        } else if (this.config.targetNeighbors!.size() + this.getOngoingHandshakes().size < this.config.N) {
            return this.respondWithAccepted(request, requester)
        } else if (this.config.targetNeighbors!.size([request.interleavingFrom!]) >= 1 &&
            this.config.targetNeighbors!.size() + this.getOngoingHandshakes().size >= this.config.N) {
            return this.respondWithInterleaveRequest(request, requester)
        } else {
            return this.respondWithUnaccepted(request)
        }
    }

    private respondWithInterleaveRequest(request: StreamHandshakeRequest, requester: RemoteRandomGraphNode): StreamHandshakeResponse {
        const exclude = request.neighbors
        exclude.push(request.senderId)
        exclude.push(request.interleavingFrom!)
        const furthest = this.config.targetNeighbors.getFurthest(exclude)
        const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined
        if (furthest) {
            furthest.interleaveNotice(this.config.ownPeerDescriptor, request.senderDescriptor!)
            this.config.targetNeighbors.remove(furthest.getPeerDescriptor())
            this.config.connectionLocker.unlockConnection(furthestPeerDescriptor!, this.config.randomGraphId)
        } else {
            logger.trace('furthest was falsy')
        }
        this.config.targetNeighbors.add(requester)
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

    private respondWithAccepted(request: StreamHandshakeRequest, requester: RemoteRandomGraphNode): StreamHandshakeResponse {
        const res: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: true
        }
        this.config.targetNeighbors.add(requester)
        this.config.connectionLocker.lockConnection(request.senderDescriptor!, this.config.randomGraphId)
        return res
    }

    public getOngoingHandshakes(): Set<string> {
        return this.ongoingHandshakes
    }

}
