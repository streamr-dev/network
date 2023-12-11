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
import { Logger, binaryToHex } from '@streamr/utils'
import { StreamPartID } from '@streamr/protocol'

interface HandshakeRpcLocalConfig {
    streamPartId: StreamPartID
    targetNeighbors: NodeList
    connectionLocker: ConnectionLocker
    ongoingHandshakes: Set<NodeID>
    ongoingInterleaves: Set<NodeID>
    maxNeighborCount: number
    createRpcRemote: (target: PeerDescriptor) => HandshakeRpcRemote
    createDeliveryRpcRemote: (peerDescriptor: PeerDescriptor) => DeliveryRpcRemote
    handshakeWithInterleaving: (target: PeerDescriptor, senderId: NodeID) => Promise<boolean>
}

const logger = new Logger(module)

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
        if (this.config.ongoingInterleaves.has(getNodeIdFromPeerDescriptor(senderDescriptor))) {
            return this.rejectHandshake(request)
        } else if (this.config.targetNeighbors.hasNode(senderDescriptor)
            || this.config.ongoingHandshakes.has(getNodeIdFromPeerDescriptor(senderDescriptor))
        ) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (this.config.targetNeighbors.size() + this.config.ongoingHandshakes.size < this.config.maxNeighborCount) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (this.config.targetNeighbors.size(getInterleaveSourceIds()) - this.config.ongoingInterleaves.size >= 2) {
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
        const exclude: NodeID[] = []
        request.neighborIds.forEach((id: Uint8Array) => exclude.push(binaryToHex(id) as NodeID))
        this.config.ongoingInterleaves.forEach((id) => exclude.push(id))
        exclude.push(getNodeIdFromPeerDescriptor(requester))
        if (request.interleaveSourceId !== undefined) {
            exclude.push(binaryToHex(request.interleaveSourceId) as NodeID)
        }
        const furthest = this.config.targetNeighbors.getFurthest(exclude)
        const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined
        if (furthest) {
            const nodeId = getNodeIdFromPeerDescriptor(furthest.getPeerDescriptor())
            const remote = this.config.createRpcRemote(furthest.getPeerDescriptor())
            this.config.ongoingInterleaves.add(nodeId)
            // Run this with then catch instead of setImmediate to avoid changes in state
            // eslint-disable-next-line promise/catch-or-return
            remote.interleaveRequest(requester).then((response) => {
                if (response.accepted) {
                    this.config.targetNeighbors.remove(furthest.getPeerDescriptor())
                    this.config.connectionLocker.unlockConnection(furthestPeerDescriptor!, this.config.streamPartId)
                }
                return
            }).catch((err) => {
                logger.trace('interleaveRequest failed', err)
            }).finally(() => {
                this.config.ongoingInterleaves.delete(nodeId)
            })
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
            logger.debug(`interleaveRequest to ${getNodeIdFromPeerDescriptor(message.interleaveTargetDescriptor!)} failed: ${err}`)
            return { accepted: false }
        }
    }
}
