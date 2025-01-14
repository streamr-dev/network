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

export interface ContentDeliveryRpcLocalOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousNode?: DhtAddress) => void
    onLeaveNotice(remoteNodeId: DhtAddress, isLocalNodeEntryPoint: boolean): void
    markForInspection(remoteNodeId: DhtAddress, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
}

export class ContentDeliveryRpcLocal implements IContentDeliveryRpc {
    private readonly options: ContentDeliveryRpcLocalOptions

    constructor(options: ContentDeliveryRpcLocalOptions) {
        this.options = options
    }

    async sendStreamMessage(message: StreamMessage, context: ServerCallContext): Promise<Empty> {
        const previousNode = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        this.options.markForInspection(previousNode, message.messageId!)
        if (this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
            this.options.broadcast(message, previousNode)
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
