import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, DhtAddressRaw, DhtCallContext, PeerDescriptor, toDhtAddress, toNodeId } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import {
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { IHandshakeRpc } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { NodeList } from '../NodeList'
import { HandshakeRpcRemote } from './HandshakeRpcRemote'

interface HandshakeRpcLocalOptions {
    streamPartId: StreamPartID
    neighbors: NodeList
    ongoingHandshakes: Set<DhtAddress>
    ongoingInterleaves: Set<DhtAddress>
    maxNeighborCount: number
    createRpcRemote: (target: PeerDescriptor) => HandshakeRpcRemote
    createContentDeliveryRpcRemote: (peerDescriptor: PeerDescriptor) => ContentDeliveryRpcRemote
    handshakeWithInterleaving: (target: PeerDescriptor, remoteNodeId: DhtAddress) => Promise<boolean>
}

const logger = new Logger(module)

export class HandshakeRpcLocal implements IHandshakeRpc {
    private readonly options: HandshakeRpcLocalOptions

    constructor(options: HandshakeRpcLocalOptions) {
        this.options = options
    }

    async handshake(
        request: StreamPartHandshakeRequest,
        context: ServerCallContext
    ): Promise<StreamPartHandshakeResponse> {
        return this.handleRequest(request, context)
    }

    private handleRequest(
        request: StreamPartHandshakeRequest,
        context: ServerCallContext
    ): StreamPartHandshakeResponse {
        const senderDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const getInterleaveNodeIds = () =>
            request.interleaveNodeId !== undefined ? [toDhtAddress(request.interleaveNodeId)] : []
        const senderNodeId = toNodeId(senderDescriptor)
        if (this.options.ongoingInterleaves.has(senderNodeId)) {
            return this.rejectHandshake(request)
        } else if (this.options.neighbors.has(senderNodeId) || this.options.ongoingHandshakes.has(senderNodeId)) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (
            this.options.neighbors.size() + this.options.ongoingHandshakes.size <
            this.options.maxNeighborCount
        ) {
            return this.acceptHandshake(request, senderDescriptor)
        } else if (
            this.options.neighbors.size(getInterleaveNodeIds()) - this.options.ongoingInterleaves.size >= 2 &&
            this.options.neighbors.size() <= this.options.maxNeighborCount
        ) {
            // Do not accept the handshakes requests if the target neighbor count can potentially drop below 2
            // due to interleaving. This ensures that a stable number of connections is kept during high churn.
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
        this.options.neighbors.add(this.options.createContentDeliveryRpcRemote(requester))
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

    private acceptHandshakeWithInterleaving(
        request: StreamPartHandshakeRequest,
        requester: PeerDescriptor
    ): StreamPartHandshakeResponse {
        const exclude: DhtAddress[] = []
        request.neighborNodeIds.forEach((id: DhtAddressRaw) => exclude.push(toDhtAddress(id)))
        this.options.ongoingInterleaves.forEach((id) => exclude.push(id))
        exclude.push(toNodeId(requester))
        if (request.interleaveNodeId !== undefined) {
            exclude.push(toDhtAddress(request.interleaveNodeId))
        }
        const last = this.options.neighbors.getLast(exclude)
        const lastPeerDescriptor = last ? last.getPeerDescriptor() : undefined
        if (last) {
            const nodeId = toNodeId(last.getPeerDescriptor())
            const remote = this.options.createRpcRemote(last.getPeerDescriptor())
            this.options.ongoingInterleaves.add(nodeId)
            // Run this with then catch instead of setImmediate to avoid changes in state
            // eslint-disable-next-line promise/catch-or-return
            remote
                .interleaveRequest(requester)
                .then((response) => {
                    // If response is accepted, remove the last node from the target neighbors
                    // and unlock the connection
                    // If response is not accepted, keep the last node as a neighbor
                    if (response.accepted) {
                        this.options.neighbors.remove(toNodeId(lastPeerDescriptor!))
                    }
                })
                .catch(() => {
                    // no-op: InterleaveRequest cannot reject
                })
                .finally(() => {
                    this.options.ongoingInterleaves.delete(nodeId)
                })
        }
        this.options.neighbors.add(this.options.createContentDeliveryRpcRemote(requester))
        return {
            requestId: request.requestId,
            accepted: true,
            interleaveTargetDescriptor: lastPeerDescriptor
        }
    }

    async interleaveRequest(message: InterleaveRequest, context: ServerCallContext): Promise<InterleaveResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const remoteNodeId = toNodeId(senderPeerDescriptor)
        try {
            await this.options.handshakeWithInterleaving(message.interleaveTargetDescriptor!, remoteNodeId)
            this.options.neighbors.remove(remoteNodeId)
            return { accepted: true }
        } catch (err) {
            logger.debug(`interleaveRequest to ${toNodeId(message.interleaveTargetDescriptor!)} failed`, { err })
            return { accepted: false }
        }
    }
}
