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
import { PlumtreeManager } from './plumtree/PlumtreeManager'

export interface ContentDeliveryRpcLocalOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousNode?: DhtAddress) => void
    onLeaveNotice(remoteNodeId: DhtAddress, isLocalNodeEntryPoint: boolean): void
    markForInspection(remoteNodeId: DhtAddress, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
    plumtreeManager?: PlumtreeManager
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
        if (this.options.plumtreeManager === undefined) {
            if (this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
                this.options.broadcast(message, previousNodeId)
            }
        } else if (this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
            // Message is not a duplicate, so we can broadcast it over the plumtree
            this.options.plumtreeManager.broadcast(message, previousNodeId)
        } else {
            // Message is a duplicate, so we need to pause the neighbor
            await this.options.plumtreeManager.pauseNeighbor(previousNode, message.messageId!.messageChainId)
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
