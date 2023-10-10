import { ListeningRpcCommunicator, PeerDescriptor, DhtCallContext } from '@streamr/dht'
import { Empty } from '../proto/google/protobuf/empty'
import {
    LeaveStreamPartNotice,
    MessageID,
    MessageRef,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'

export interface StreamNodeServerConfig {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousNode?: NodeID) => void
    onLeaveNotice(senderId: NodeID): void
    markForInspection(senderId: NodeID, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
}

export class StreamNodeServer implements INetworkRpc {
    
    private readonly config: StreamNodeServerConfig

    constructor(config: StreamNodeServerConfig) {
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
        if (message.randomGraphId === this.config.randomGraphId) {
            const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
            const senderId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
            this.config.onLeaveNotice(senderId)
        }
        return Empty
    }
}
