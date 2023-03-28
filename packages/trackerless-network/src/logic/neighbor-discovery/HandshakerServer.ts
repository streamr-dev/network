import { Empty } from "../../proto/google/protobuf/empty"
import { InterleaveNotice, StreamHandshakeRequest, StreamHandshakeResponse } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { PeerList } from "../PeerList"
import { ConnectionLocker, keyFromPeerDescriptor, PeerDescriptor } from "@streamr/dht"
import { IHandshakeRpc } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { RemoteHandshaker } from "./RemoteHandshaker"
import { RemoteRandomGraphNode } from "../RemoteRandomGraphNode"

interface HandshakerServerConfig {
    randomGraphId: string
    ownPeerDescriptor: PeerDescriptor
    targetNeighbors: PeerList
    connectionLocker: ConnectionLocker
    ongoingHandshakes: Set<string>
    N: number
    createRemoteHandshaker: (target: PeerDescriptor) => RemoteHandshaker
    createRemoteNode: (peerDescriptor: PeerDescriptor) => RemoteRandomGraphNode
    handshakeWithInterleaving: (target: PeerDescriptor, senderId: string) => Promise<boolean>
}

export class HandshakerServer implements IHandshakeRpc {

    private readonly config: HandshakerServerConfig

    constructor(config: HandshakerServerConfig) {
        this.config = config
    }

    async handshake(request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> {
        return this.handleRequest(request)
    }

    private handleRequest(request: StreamHandshakeRequest): StreamHandshakeResponse {
        if (this.config.targetNeighbors!.hasPeer(request.senderDescriptor!)
            || this.config.ongoingHandshakes.has(keyFromPeerDescriptor(request.senderDescriptor!))
        ) {
            return this.acceptHandshake(request, request.senderDescriptor!)
        } else if (this.config.targetNeighbors!.size() + this.config.ongoingHandshakes.size < this.config.N) {
            return this.acceptHandshake(request, request.senderDescriptor!)
        } else if (this.config.targetNeighbors!.size([request.interleavingFrom!]) >= 2) {
            return this.acceptHandshakeWithInterleaving(request, request.senderDescriptor!)
        } else {
            return this.rejectHandshake(request)
        }
    }

    private acceptHandshake(request: StreamHandshakeRequest, requester: PeerDescriptor) {
        const res: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: true
        }
        this.config.targetNeighbors.add(this.config.createRemoteNode(requester))
        this.config.connectionLocker.lockConnection(request.senderDescriptor!, this.config.randomGraphId)
        return res
    }

    // eslint-disable-next-line class-methods-use-this
    private rejectHandshake(request: StreamHandshakeRequest) {
        const res: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: false
        }
        return res
    }

    private acceptHandshakeWithInterleaving(request: StreamHandshakeRequest, requester: PeerDescriptor): StreamHandshakeResponse {
        const exclude = request.neighbors
        exclude.push(request.senderId)
        exclude.push(request.interleavingFrom!)
        const furthest = this.config.targetNeighbors.getFurthest(exclude)
        const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined
        if (furthest) {
            const remote = this.config.createRemoteHandshaker(furthest.getPeerDescriptor())
            remote.interleaveNotice(this.config.ownPeerDescriptor, request.senderDescriptor!)
            this.config.targetNeighbors.remove(furthest.getPeerDescriptor())
            this.config.connectionLocker.unlockConnection(furthestPeerDescriptor!, this.config.randomGraphId)
        }
        this.config.targetNeighbors.add(this.config.createRemoteNode(requester))
        this.config.connectionLocker.lockConnection(request.senderDescriptor!, this.config.randomGraphId)
        return {
            requestId: request.requestId,
            accepted: true,
            interleaveTarget: furthestPeerDescriptor
        }
    }

    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            if (this.config.targetNeighbors.hasPeerWithStringId(message.senderId)) {
                const senderDescriptor = this.config.targetNeighbors.getNeighborWithId(message.senderId)!.getPeerDescriptor()
                this.config.connectionLocker.unlockConnection(senderDescriptor, this.config.randomGraphId)
                this.config.targetNeighbors.remove(senderDescriptor)
            }
            this.config.handshakeWithInterleaving(message.interleaveTarget!, message.senderId).catch((_e) => {})
        }
        return Empty
    }
}
