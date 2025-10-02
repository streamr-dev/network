import { DhtCallContext, PeerDescriptor, toNodeId } from '@streamr/dht'
import { MessageID, PauseNeighborRequest, ResumeNeighborRequest } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { Empty } from '../../../generated/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { IPlumtreeRpc } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { NodeList } from '../NodeList'
import { PausedNeighbors } from './PausedNeighbors'

type OnMetadataCb = (msg: MessageID, previousNode: PeerDescriptor) => Promise<void>
type SendBufferCb = (fromTimestamp: number, msgChainId: string, remotePeerDescriptor: PeerDescriptor) => Promise<void>
export class PlumtreeRpcLocal implements IPlumtreeRpc {

    private readonly neighbors: NodeList
    private readonly pausedNodes: PausedNeighbors
    private readonly onMetadataCb: OnMetadataCb
    private readonly sendBuffer: SendBufferCb

    constructor(
        neighbors: NodeList,
        pausedNodes: PausedNeighbors,
        onMetaDataCb: OnMetadataCb,
        sendBuffer: SendBufferCb,
    ) {
        this.neighbors = neighbors
        this.pausedNodes = pausedNodes
        this.onMetadataCb = onMetaDataCb
        this.sendBuffer = sendBuffer
    }

    async sendMetadata(message: MessageID, context: ServerCallContext): Promise<Empty> {
        const previousNode = (context as DhtCallContext).incomingSourceDescriptor!
        await this.onMetadataCb(message, previousNode)
        return Empty
    }

    async pauseNeighbor(request: PauseNeighborRequest, context: ServerCallContext): Promise<Empty> {
        const sender = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        if (this.neighbors.has(sender)) {
            this.pausedNodes.add(sender, request.messageChainId)
        }
        return Empty
    }

    async resumeNeighbor(request: ResumeNeighborRequest, context: ServerCallContext): Promise<Empty> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        this.pausedNodes.delete(toNodeId(sender), request.messageChainId)
        await this.sendBuffer(request.fromTimestamp, request.messageChainId, sender)
        return Empty
    }
}
