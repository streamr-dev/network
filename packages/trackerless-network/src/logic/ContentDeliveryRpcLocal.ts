import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, DhtCallContext, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { StreamPartID } from '@streamr/utils'
import { Empty } from '../../generated/google/protobuf/empty'
import {
    LeaveStreamPartNotice,
    MessageID,
    MessageRef,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { IContentDeliveryRpc } from '../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { PlumTreeManager } from './plumtree/PlumTreeManager'

export interface ContentDeliveryRpcLocalOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousNode?: DhtAddress) => void
    onLeaveNotice(remoteNodeId: DhtAddress, isLocalNodeEntryPoint: boolean): void
    markForInspection(remoteNodeId: DhtAddress, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
    plumTreeManager?: PlumTreeManager
}

export class ContentDeliveryRpcLocal implements IContentDeliveryRpc {
    
    private readonly options: ContentDeliveryRpcLocalOptions

    constructor(options: ContentDeliveryRpcLocalOptions) {
        this.options = options
    }

    async sendStreamMessage(message: StreamMessage, context: ServerCallContext): Promise<Empty> {
        const previousNode = (context as DhtCallContext).incomingSourceDescriptor!
        const previousNodeId = toNodeId(previousNode)
        this.options.markForInspection(previousNodeId, message.messageId!)
        if (this.options.plumTreeManager === undefined) {
            if (this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
                this.options.broadcast(message, previousNodeId)
            }
        } else if (this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
            this.options.plumTreeManager.broadcast(message, previousNodeId)
            await this.options.plumTreeManager.resumeNeighbor(previousNode, this.options.plumTreeManager.getLatestMessageTimestamp())
        } else {
            await this.options.plumTreeManager.pauseNeighbor(previousNode)
        }
        return Empty
    }

    async leaveStreamPartNotice(message: LeaveStreamPartNotice, context: ServerCallContext): Promise<Empty> {
        if (message.streamPartId === this.options.streamPartId) {
            const sourcePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
            const remoteNodeId = toNodeId(sourcePeerDescriptor)
            this.options.onLeaveNotice(remoteNodeId, message.isEntryPoint)
        }
        return Empty
    }
}
