import { ListeningRpcCommunicator, PeerDescriptor, DhtCallContext, DhtAddress, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { Empty } from '../proto/google/protobuf/empty'
import {
    LeaveStreamPartNotice,
    MessageID,
    MessageRef,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { IContentDeliveryRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { StreamPartID } from '@streamr/protocol'

export interface ContentDeliveryRpcLocalConfig {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousNode?: DhtAddress) => void
    onLeaveNotice(remoteNodeId: DhtAddress, isLocalNodeEntryPoint: boolean): void
    markForInspection(remoteNodeId: DhtAddress, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
}

export class ContentDeliveryRpcLocal implements IContentDeliveryRpc {
    
    private readonly config: ContentDeliveryRpcLocalConfig

    constructor(config: ContentDeliveryRpcLocalConfig) {
        this.config = config
    }

    async sendStreamMessage(message: StreamMessage, context: ServerCallContext): Promise<Empty> {
        const previousNode = getNodeIdFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!)
        this.config.markForInspection(previousNode, message.messageId!)
        if (this.config.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
            this.config.broadcast(message, previousNode)
        }
        return Empty
    }

    async leaveStreamPartNotice(message: LeaveStreamPartNotice, context: ServerCallContext): Promise<Empty> {
        if (message.streamPartId === this.config.streamPartId) {
            const sourcePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
            const remoteNodeId = getNodeIdFromPeerDescriptor(sourcePeerDescriptor)
            this.config.onLeaveNotice(remoteNodeId, message.isEntryPoint)
        }
        return Empty
    }
}
