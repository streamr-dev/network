import { 
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { NodeList } from '../NodeList'
import { ConnectionLocker, DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { IHandshakeRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { HandshakeRpcRemote } from './HandshakeRpcRemote'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { binaryToHex } from '@streamr/utils'
import { StreamPartID } from '@streamr/protocol'

interface HandshakeRpcLocalConfig {
    streamPartId: StreamPartID
    targetNeighbors: NodeList
    connectionLocker: ConnectionLocker
    ongoingHandshakes: Set<NodeID>
    maxNeighborCount: number
    createRpcRemote: (target: PeerDescriptor) => HandshakeRpcRemote
    createDeliveryRpcRemote: (peerDescriptor: PeerDescriptor) => DeliveryRpcRemote
    handshakeWithInterleaving: (target: PeerDescriptor, senderId: NodeID) => Promise<boolean>
}

export class HandshakeRpcLocal implements IHandshakeRpc {

    private readonly config: HandshakeRpcLocalConfig

    constructor(config: HandshakeRpcLocalConfig) {
        this.config = config
    }

    async handshake(request: StreamPartHandshakeRequest, context: ServerCallContext): Promise<StreamPartHandshakeResponse> {
        return this.handleRequest(request, context)
    }

    private handleRequest(request: StreamPartHandshakeRequest, context: ServerCallContext): StreamPartHandshakeResponse {
        const senderDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const getInterleaveSourceIds = () => (request.interleaveSourceId !== undefined) ? [binaryToHex(request.interleaveSourceId) as NodeID] : []
        if (this.config.targetNeighbors.hasNode(senderDescriptor)
            || this.config.ongoingHandshakes.has(getNodeIdFromPeerDescriptor(senderDescriptor))
        ) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (this.config.targetNeighbors.size() + this.config.ongoingHandshakes.size < this.config.maxNeighborCount) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (this.config.targetNeighbors.size(getInterleaveSourceIds()) >= 2) {
            // TODO use config option or named constant? (or is this always >1?)
            return this.acceptHandshakeWithInterleaving(request, senderDescriptor)
        } else {
            return this.rejectHandshake(request)
        }
    }

    private acceptHandshake(request: StreamPartHandshakeRequest, requester: PeerDescriptor) {
        const res: StreamPartHandshakeResponse = {
            requestId: request.requestId,
            accepted: true
        }
        this.config.targetNeighbors.add(this.config.createDeliveryRpcRemote(requester))
        this.config.connectionLocker.lockConnection(requester, this.config.streamPartId)
        return res
    }

    // eslint-disable-next-line class-methods-use-this
    private rejectHandshake(request: StreamPartHandshakeRequest) {
        const res: StreamPartHandshakeResponse = {
            requestId: request.requestId,
            accepted: false
        }
        return res
    }

    private acceptHandshakeWithInterleaving(request: StreamPartHandshakeRequest, requester: PeerDescriptor): StreamPartHandshakeResponse {
        const exclude = request.neighborIds.map((id: Uint8Array) => binaryToHex(id) as NodeID)
        exclude.push(getNodeIdFromPeerDescriptor(requester))
        if (request.interleaveSourceId !== undefined) {
            exclude.push(binaryToHex(request.interleaveSourceId) as NodeID)
        }
        const furthest = this.config.targetNeighbors.getFurthest(exclude)
        const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined
        if (furthest) {
            const remote = this.config.createRpcRemote(furthest.getPeerDescriptor())
            remote.interleaveRequest(requester).then((accepted) => {
                if (accepted) {
                    this.config.targetNeighbors.remove(furthest.getPeerDescriptor())
                    this.config.connectionLocker.unlockConnection(furthestPeerDescriptor!, this.config.streamPartId)
                }
            }).catch((err) => {console.error('interleaveRequest failed', err)})
        }
        this.config.targetNeighbors.add(this.config.createDeliveryRpcRemote(requester))
        this.config.connectionLocker.lockConnection(requester, this.config.streamPartId)
        return {
            requestId: request.requestId,
            accepted: true,
            interleaveTargetDescriptor: furthestPeerDescriptor
        }
    }

    async interleaveRequest(message: InterleaveRequest, context: ServerCallContext): Promise<InterleaveResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const senderId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        try {
            await this.config.handshakeWithInterleaving(message.interleaveTargetDescriptor!, senderId)
            if (this.config.targetNeighbors.hasNodeById(senderId)) {
                this.config.connectionLocker.unlockConnection(senderPeerDescriptor, this.config.streamPartId)
                this.config.targetNeighbors.remove(senderPeerDescriptor)
            }
            return { accepted: true }
        } catch (err) {
            console.error(`interleaveRequest to ${getNodeIdFromPeerDescriptor(message.interleaveTargetDescriptor!)} failed: ${err}`)
            return { accepted: false }
        }
    }
}
