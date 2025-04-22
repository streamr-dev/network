import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from "@streamr/dht";
import { MessageID, StreamMessage } from "../../../generated/packages/trackerless-network/protos/NetworkRpc";
import { NodeList } from "../NodeList";
import { ContentDeliveryRpcRemote } from "../ContentDeliveryRpcRemote";
import { PlumTreeRpcLocal } from "./PlumTreeRpcLocal";
import { PlumTreeRpcRemote } from "./PlumTreeRpcRemote";
import { PlumTreeRpcClient } from "../../../generated/packages/trackerless-network/protos/NetworkRpc.client";

interface Options {
    neighbors: NodeList
    localPeerDescriptor: PeerDescriptor
    rpcCommunicator: ListeningRpcCommunicator
}

export class PlumTreeManager {
    private neighbors: NodeList
    private pausedNeighbors: Set<DhtAddress>
    private localPeerDescriptor: PeerDescriptor
    private rpcLocal: PlumTreeRpcLocal
    private lastMessages: StreamMessage[] = []
    private rpcCommunicator: ListeningRpcCommunicator

    constructor(options: Options) {
        this.neighbors = options.neighbors
        this.pausedNeighbors = new Set()
        this.localPeerDescriptor = options.localPeerDescriptor
        this.rpcLocal = new PlumTreeRpcLocal(this.pausedNeighbors, () => {})
        this.rpcCommunicator = options.rpcCommunicator
        this.neighbors.on('nodeRemoved', this.onNeighborRemoved)
    }

    onNeighborRemoved(nodeId: DhtAddress): void {
        this.pausedNeighbors.delete(nodeId)
    }

    async pauseNeighbor(node: PeerDescriptor): Promise<void> {
        const remote = this.createRemote(node)
        await remote.pauseNeighbor(toNodeId(node))
    }

    async resumeNeighbor(node: PeerDescriptor): Promise<void> {
        const remote = this.createRemote(node)
        await remote.resumeNeighbor(toNodeId(node))
    }

    getNumberOfPausedNeighbors(): number {
        return this.pausedNeighbors.size
    }

    onMetadata(msg: MessageID, previousNode: PeerDescriptor): void {
        // Check that the message is found in the last 20 messages
        // If not resume the sending neighbor 
    }

    createRemote(neighbor: PeerDescriptor): PlumTreeRpcRemote {
        return new PlumTreeRpcRemote(neighbor, this.localPeerDescriptor, this.rpcCommunicator, PlumTreeRpcClient)
    }


    broadcast(msg: StreamMessage, previousNode: DhtAddress): void {
        if (this.lastMessages.length < 20) {
            this.lastMessages.push(msg)
        } else {
            this.lastMessages.shift()
            this.lastMessages.push(msg)
        }
        const neighbors = this.neighbors.getAll().filter((neighbor) => toNodeId(neighbor.getPeerDescriptor()) !== previousNode)
        for (const neighbor of neighbors) {
            if (this.pausedNeighbors.has(toNodeId(neighbor.getPeerDescriptor()))) {
                const remote = this.createRemote(neighbor.getPeerDescriptor())
                remote.sendMetadata(msg.messageId!)
            } else {
                neighbor.sendStreamMessage(msg)
            }
        }
    }

    stop(): void {
        this.neighbors.off('nodeRemoved', this.onNeighborRemoved)
    }
        
}
