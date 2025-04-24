import { DhtAddress, DhtCallContext, PeerDescriptor, toNodeId } from '@streamr/dht'
import { MessageID, PauseNeighborRequest, ResumeNeighborRequest } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { Empty } from '../../../generated/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { IPlumTreeRpc } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.server'

type OnMetadataCb = (msg: MessageID, previousNode: PeerDescriptor) => Promise<void>
export class PlumTreeRpcLocal implements IPlumTreeRpc {

    private readonly pausedNodes: Set<DhtAddress>
    private readonly onMetadataCb: OnMetadataCb
    private readonly sendBuffer: () => void

    constructor(
        pausedNodes: Set<DhtAddress>,
        onMetaDataCb: OnMetadataCb,
        sendBuffer: () => void,
    ) {
        this.pausedNodes = pausedNodes
        this.onMetadataCb = onMetaDataCb
        this.sendBuffer = sendBuffer
    }

    async sendMetadata(message: MessageID, context: ServerCallContext): Promise<Empty> {
        const previousNode = (context as DhtCallContext).incomingSourceDescriptor!
        await this.onMetadataCb(message, previousNode)
        return Empty
    }

    async pauseNeighbor(_request: PauseNeighborRequest, context: ServerCallContext): Promise<Empty> {
        const sender = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        this.pausedNodes.add(sender)
        return Empty
    }

    async resumeNeighbor(_request: ResumeNeighborRequest, context: ServerCallContext): Promise<Empty> {
        const sender = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        this.pausedNodes.delete(sender)
        this.sendBuffer()
        return Empty
    }
}
