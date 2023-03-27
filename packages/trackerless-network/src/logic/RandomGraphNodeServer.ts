import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { ConnectionLocker, DhtNode, keyFromPeerDescriptor, ListeningRpcCommunicator, PeerDescriptor } from "@streamr/dht"
import { Empty } from "../proto/google/protobuf/empty"
import { LeaveStreamNotice, MessageRef, StreamMessage } from "../proto/packages/trackerless-network/protos/NetworkRpc"
import { INetworkRpc } from "../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { INeighborFinder } from "./neighbor-discovery/NeighborFinder"
import { PeerList } from "./PeerList"

export interface RandomGraphNodeServerConfig {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    markAndCheckDuplicate: (messageRef: MessageRef, previousMessageRef?: MessageRef) => boolean
    broadcast: (message: StreamMessage, previousPeer?: string) => void
    layer1: DhtNode
    targetNeighbors: PeerList
    nearbyContactPool: PeerList
    randomContactPool: PeerList
    connectionLocker: ConnectionLocker
    neighborFinder: INeighborFinder
    rpcCommunicator: ListeningRpcCommunicator
}

export class RandomGraphNodeServer implements INetworkRpc {
    
    private readonly config: RandomGraphNodeServerConfig

    constructor(config: RandomGraphNodeServerConfig) {
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
            const contact = this.config.nearbyContactPool.getNeighborWithId(message.senderId)
                || this.config.randomContactPool.getNeighborWithId(message.senderId)
                || this.config.targetNeighbors.getNeighborWithId(message.senderId)
            // TODO: check integrity of notifier?
            if (contact) {
                this.config.layer1.removeContact(contact.getPeerDescriptor(), true)
                this.config.targetNeighbors.remove(contact.getPeerDescriptor())
                this.config.nearbyContactPool.remove(contact.getPeerDescriptor())
                this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.randomGraphId)
                this.config.neighborFinder.start([message.senderId])
            }
        }
        return Empty
    }
}
