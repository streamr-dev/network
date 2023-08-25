import { keyFromPeerDescriptor, ListeningRpcCommunicator, PeerDescriptor, DhtCallContext, PeerIDKey } from '@streamr/dht'
import { Empty } from '../proto/google/protobuf/empty'
import {
    LeaveStreamNotice,
    MessageID,
    MessageRef,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export interface StreamNodeServerConfig {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousPeer?: string) => void
    onLeaveNotice(notice: LeaveStreamNotice): void
    markForInspection(senderId: PeerIDKey, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
}

export class StreamNodeServer implements INetworkRpc {
    
    private readonly config: StreamNodeServerConfig

    constructor(config: StreamNodeServerConfig) {
        this.config = config
    }

    async sendData(message: StreamMessage, context: ServerCallContext): Promise<Empty> {
        const previousPeer = keyFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!)
        this.config.markForInspection(previousPeer, message.messageId!)
        if (this.config.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
            this.config.broadcast(message, previousPeer)
        }
        return Empty
    }

    async leaveStreamNotice(message: LeaveStreamNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            this.config.onLeaveNotice(message)
        }
        return Empty
    }
}
