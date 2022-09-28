import { ConnectionLocker, PeerDescriptor, PeerID } from '@streamr/dht'
import { PeerList } from './PeerList'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'

interface HandshakerParams {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    connectionLocker: ConnectionLocker
    targetNeighbors: PeerList
    contactPool: PeerList
    protoRpcClient: ProtoRpcClient<NetworkRpcClient>
}

export class Handshaker {

    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly randomGraphId: string
    private readonly connectionLocker: ConnectionLocker
    private readonly targetNeighbors: PeerList
    private readonly contactPool: PeerList
    private readonly ongoingHandshakes: Set<string> = new Set()
    private readonly protoRpcClient: ProtoRpcClient<NetworkRpcClient>

    constructor(params: HandshakerParams) {
        this.contactPool = params.contactPool
        this.targetNeighbors = params.targetNeighbors
        this.ownPeerDescriptor = params.ownPeerDescriptor
        this.connectionLocker = params.connectionLocker
        this.randomGraphId = params.randomGraphId
        this.protoRpcClient = params.protoRpcClient
    }

    public async findParallelTargetsAndHandshake(excludedIds: string[]): Promise<string[]> {
        const exclude = excludedIds.concat(this.targetNeighbors.getStringIds())
        const targetNeighbors = this.contactPool.getClosestAndFurthest(exclude)
        targetNeighbors.forEach((contact) => this.ongoingHandshakes.add(PeerID.fromValue(contact.getPeerDescriptor().peerId).toKey()))

        const promises = [...targetNeighbors.values()].map(async (target: RemoteRandomGraphNode, i) => {
            const otherPeer = i === 0 ? targetNeighbors[1] : targetNeighbors[0]
            const otherPeerStringId = targetNeighbors.length > 1 ? PeerID.fromValue(otherPeer.getPeerDescriptor().peerId).toKey() : undefined
            return this.handshakeWithTarget(target, otherPeerStringId)
        })
        const results = await Promise.allSettled(promises)
        results.map((res, i) => {
            if (res.status !== 'fulfilled' || !res.value) {
                excludedIds.push(PeerID.fromValue(targetNeighbors[i].getPeerDescriptor().peerId).toKey())
            }
        })
        return excludedIds
    }

    public async findNewTargetAndHandshake(excludedIds: string[]): Promise<string[]> {
        const exclude = excludedIds.concat(this.targetNeighbors.getStringIds())
        const targetNeighbor = this.contactPool.getClosest(exclude)
        if (targetNeighbor) {
            const accepted = await this.handshakeWithTarget(targetNeighbor)
            if (!accepted) {
                excludedIds.push(PeerID.fromValue(targetNeighbor.getPeerDescriptor()!.peerId).toKey())
            }
        }
        return excludedIds
    }

    public async handshakeWithTarget(targetNeighbor: RemoteRandomGraphNode, concurrentStringId?: string): Promise<boolean> {
        const targetStringId = PeerID.fromValue(targetNeighbor.getPeerDescriptor()!.peerId).toKey()

        this.ongoingHandshakes.add(targetStringId)
        const result = await targetNeighbor.handshake(
            this.ownPeerDescriptor,
            this.targetNeighbors.getStringIds(),
            this.contactPool.getStringIds(),
            concurrentStringId
        )
        if (result.accepted) {
            this.targetNeighbors.add(targetNeighbor)
            this.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.randomGraphId)
        }
        if (result.interleaveTarget) {
            const interleaveTarget = new RemoteRandomGraphNode(
                result.interleaveTarget,
                this.randomGraphId,
                this.protoRpcClient
            )
            await this.interleaveHandshake(interleaveTarget)
        }
        this.ongoingHandshakes.delete(targetStringId)

        return result.accepted
    }

    public async interleaveHandshake(targetNeighbor: RemoteRandomGraphNode): Promise<boolean> {
        const targetStringId = PeerID.fromValue(targetNeighbor.getPeerDescriptor()!.peerId).toKey()
        this.ongoingHandshakes.add(targetStringId)
        const result = await targetNeighbor.handshake(
            this.ownPeerDescriptor,
            this.targetNeighbors.getStringIds(),
            this.contactPool.getStringIds(),
            undefined,
            true
        )
        if (result.accepted) {
            this.targetNeighbors.add(targetNeighbor)
            this.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.randomGraphId)
        }
        this.ongoingHandshakes.delete(targetStringId)

        return result.accepted
    }

    public getOngoingHandshakes(): Set<string> {
        return this.ongoingHandshakes
    }

}
