import { DhtAddress, DhtCallContext, Message, PeerDescriptor, toNodeId } from "@streamr/dht"
import { MessageID, PauseNeighborRequest, ResumeNeighborRequest } from "../../../generated/packages/trackerless-network/protos/NetworkRpc"
import { Empty } from "../../../generated/google/protobuf/empty"
import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { IPlumTreeRpc } from "../../../generated/packages/trackerless-network/protos/NetworkRpc.server"

type OnMetadataCb = (msg: MessageID, previousNode: PeerDescriptor) => void
export class PlumTreeRpcLocal implements IPlumTreeRpc {

    private readonly pausedNodes: Set<DhtAddress>
    private readonly onMetadataCb: OnMetadataCb

    constructor(pausedNodes: Set<DhtAddress>, onMetaDataCb: OnMetadataCb) {
        this.pausedNodes = pausedNodes
        this.onMetadataCb = onMetaDataCb
    }

    async sendMetadata(message: MessageID, context: ServerCallContext): Promise<Empty> {
        const previousNode = (context as DhtCallContext).incomingSourceDescriptor!
        this.onMetadataCb(message, previousNode)
        return Empty
    }

    async pauseNeighbor(request: PauseNeighborRequest, context: ServerCallContext): Promise<Empty> {
        const sender = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        this.pausedNodes.add(sender)
        return Empty
   }

    async resumeNeighbor(request: ResumeNeighborRequest, context: ServerCallContext): Promise<Empty> {
        const sender = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        this.pausedNodes.delete(sender)
        return Empty
    }
}