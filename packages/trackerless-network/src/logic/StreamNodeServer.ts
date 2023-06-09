import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { keyFromPeerDescriptor, ListeningRpcCommunicator, PeerDescriptor } from "@streamr/dht"
import { Empty } from "../proto/google/protobuf/empty"
import { LeaveStreamNotice, MessageRef, StreamMessage } from "../proto/packages/trackerless-network/protos/NetworkRpc"
import { INetworkRpc } from "../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { EventEmitter } from "eventemitter3"

export interface StreamNodeServerConfig {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    markAndCheckDuplicate: (messageRef: MessageRef, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousPeer?: string) => void
    onLeaveNotice(notice: LeaveStreamNotice): void
    rpcCommunicator: ListeningRpcCommunicator
}

export interface Events {
    leaveStreamNotice: (peerDescriptor: PeerDescriptor) => void
}

export class StreamNodeServer extends EventEmitter<Events> implements INetworkRpc {
    
    private readonly config: StreamNodeServerConfig

    constructor(config: StreamNodeServerConfig) {
        super()
        this.config = config
    }

    async sendData(message: StreamMessage, _context: ServerCallContext): Promise<Empty> {
        if (this.config.markAndCheckDuplicate(message.messageRef!, message.previousMessageRef)) {
            const { previousPeer } = message
            message["previousPeer"] = keyFromPeerDescriptor(this.config.ownPeerDescriptor)
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
