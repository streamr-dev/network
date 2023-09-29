import { Empty } from '../../proto/google/protobuf/empty'
import { InterleaveNotice, StreamHandshakeRequest, StreamHandshakeResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { NodeList } from '../NodeList'
import { ConnectionLocker, DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { RemoteHandshaker } from './RemoteHandshaker'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { binaryToHex } from '@streamr/utils'

interface HandshakerServerConfig {
    randomGraphId: string
    ownPeerDescriptor: PeerDescriptor
    targetNeighbors: NodeList
    connectionLocker: ConnectionLocker
    ongoingHandshakes: Set<NodeID>
    N: number
    createRemoteHandshaker: (target: PeerDescriptor) => RemoteHandshaker
    createRemoteNode: (peerDescriptor: PeerDescriptor) => RemoteRandomGraphNode
    handshakeWithInterleaving: (target: PeerDescriptor, senderId: NodeID) => Promise<boolean>
}

export class HandshakerServer implements IHandshakeRpc {

    private readonly config: HandshakerServerConfig

    constructor(config: HandshakerServerConfig) {
        this.config = config
    }

    async handshake(request: StreamHandshakeRequest, context: ServerCallContext): Promise<StreamHandshakeResponse> {
        return this.handleRequest(request, context)
    }

    private handleRequest(request: StreamHandshakeRequest, context: ServerCallContext): StreamHandshakeResponse {
        const senderDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const getInterleaveSourceIds = () => (request.interleaveSourceId !== undefined) ? [binaryToHex(request.interleaveSourceId) as NodeID] : []
        if (this.config.targetNeighbors.hasNode(senderDescriptor)
            || this.config.ongoingHandshakes.has(getNodeIdFromPeerDescriptor(senderDescriptor))
        ) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (this.config.targetNeighbors.size() + this.config.ongoingHandshakes.size < this.config.N) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (this.config.targetNeighbors.size(getInterleaveSourceIds()) >= 2) {
            return this.acceptHandshakeWithInterleaving(request, senderDescriptor)
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
        this.config.connectionLocker.lockConnection(requester, this.config.randomGraphId)
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
        const exclude = request.neighborIds.map((id: Uint8Array) => binaryToHex(id) as NodeID)
        exclude.push(getNodeIdFromPeerDescriptor(requester))
        if (request.interleaveSourceId !== undefined) {
            exclude.push(binaryToHex(request.interleaveSourceId) as NodeID)
        }
        const furthest = this.config.targetNeighbors.getFurthest(exclude)
        const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined
        if (furthest) {
            const remote = this.config.createRemoteHandshaker(furthest.getPeerDescriptor())
            remote.interleaveNotice(this.config.ownPeerDescriptor, requester)
            this.config.targetNeighbors.remove(furthest.getPeerDescriptor())
            this.config.connectionLocker.unlockConnection(furthestPeerDescriptor!, this.config.randomGraphId)
        }
        this.config.targetNeighbors.add(this.config.createRemoteNode(requester))
        this.config.connectionLocker.lockConnection(requester, this.config.randomGraphId)
        return {
            requestId: request.requestId,
            accepted: true,
            interleaveTargetDescriptor: furthestPeerDescriptor
        }
    }

    async interleaveNotice(message: InterleaveNotice, context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
            const senderId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
            if (this.config.targetNeighbors.hasNodeById(senderId)) {
                this.config.connectionLocker.unlockConnection(senderPeerDescriptor, this.config.randomGraphId)
                this.config.targetNeighbors.remove(senderPeerDescriptor)
            }
            this.config.handshakeWithInterleaving(message.interleaveTargetDescriptor!, senderId).catch((_e) => {})
        }
        return Empty
    }
}
