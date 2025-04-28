import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { 
    MessageID,
    PauseNeighborRequest,
    ResumeNeighborRequest,
    StreamMessage
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NodeList } from '../NodeList'
import { PlumTreeRpcLocal } from './PlumTreeRpcLocal'
import { PlumTreeRpcRemote } from './PlumTreeRpcRemote'
import { ContentDeliveryRpcClient, PlumTreeRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import EventEmitter from 'eventemitter3'
import { Logger } from '@streamr/utils'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'

interface Options {
    neighbors: NodeList
    localPeerDescriptor: PeerDescriptor
    rpcCommunicator: ListeningRpcCommunicator
}

const logger = new Logger(module)

interface Events {
    message: (msg: StreamMessage, previousNode: DhtAddress) => void
}

export class PlumTreeManager extends EventEmitter<Events> {
    private neighbors: NodeList
    private localPeerDescriptor: PeerDescriptor
    private localPausedNeighbors: Set<DhtAddress> = new Set()
    private remotePausedNeighbors: Set<DhtAddress> = new Set()
    private rpcLocal: PlumTreeRpcLocal
    private latestMessages: StreamMessage[] = []
    private rpcCommunicator: ListeningRpcCommunicator

    constructor(options: Options) {
        super()
        this.neighbors = options.neighbors
        this.localPeerDescriptor = options.localPeerDescriptor
        this.rpcLocal = new PlumTreeRpcLocal(
            this.neighbors,
            this.localPausedNeighbors,
            (metadata: MessageID, previousNode: PeerDescriptor) => this.onMetadata(metadata, previousNode),
            (fromTimestamp: number, remotePeerDescriptor: PeerDescriptor) => this.sendBuffer(fromTimestamp, remotePeerDescriptor)
        )
        this.neighbors.on('nodeRemoved', this.onNeighborRemoved)
        this.rpcCommunicator = options.rpcCommunicator
        this.rpcCommunicator.registerRpcNotification(MessageID, 'sendMetadata', (msg: MessageID, context) => this.rpcLocal.sendMetadata(msg, context))
        this.rpcCommunicator.registerRpcNotification(
            PauseNeighborRequest,
            'pauseNeighbor',
            (msg: PauseNeighborRequest, context) => this.rpcLocal.pauseNeighbor(msg, context))
        this.rpcCommunicator.registerRpcNotification(
            ResumeNeighborRequest,
            'resumeNeighbor', (msg: ResumeNeighborRequest, context) => this.rpcLocal.resumeNeighbor(msg, context))
    }

    onNeighborRemoved(nodeId: DhtAddress): void {
        this.localPausedNeighbors.delete(nodeId)
        this.remotePausedNeighbors.delete(nodeId)
    }

    async pauseNeighbor(node: PeerDescriptor): Promise<void> {
        if (this.neighbors.has(toNodeId(node))) {
            logger.debug(`Pausing neighbor ${toNodeId(node)}`)
            this.remotePausedNeighbors.add(toNodeId(node))
            const remote = this.createRemote(node)
            await remote.pauseNeighbor()
        }
    }

    async resumeNeighbor(node: PeerDescriptor, fromTimestamp: number): Promise<void> {
        if (this.remotePausedNeighbors.has(toNodeId(node))) {
            logger.debug(`Resuming neighbor ${toNodeId(node)}`)
            this.remotePausedNeighbors.delete(toNodeId(node))
            const remote = this.createRemote(node)
            await remote.resumeNeighbor(fromTimestamp)
        }
    }

    getLatestMessageTimestamp(): number {
        if (this.latestMessages.length === 0) {
            return 0
        }
        return this.latestMessages[this.latestMessages.length - 1].messageId!.timestamp
    }

    async sendBuffer(fromTimestamp: number, neighbor: PeerDescriptor): Promise<void> {
        const remote = new ContentDeliveryRpcRemote(this.localPeerDescriptor, neighbor, this.rpcCommunicator, ContentDeliveryRpcClient)
        const messages = this.latestMessages.filter((msg) => msg.messageId!.timestamp >= fromTimestamp)
        await Promise.all(messages.map((msg) => remote!.sendStreamMessage(msg)))
    }

    async onMetadata(msg: MessageID, previousNode: PeerDescriptor): Promise<void> {
        // If the number of messages in the buffer is greater than 1, resume the sending neighbor
        // This is done to avoid oscillation of the neighbors during propagation
        if (this.latestMessages.filter((m) => m.messageId!.timestamp >= msg.timestamp).length > 1) {
            await this.resumeNeighbor(previousNode, this.getLatestMessageTimestamp())
        }
    }

    createRemote(neighbor: PeerDescriptor): PlumTreeRpcRemote {
        return new PlumTreeRpcRemote(this.localPeerDescriptor, neighbor, this.rpcCommunicator, PlumTreeRpcClient)
    }

    broadcast(msg: StreamMessage, previousNode: DhtAddress): void {
        if (this.latestMessages.length < 20) {
            this.latestMessages.push(msg)
        } else {
            this.latestMessages.shift()
            this.latestMessages.push(msg)
        }
        this.emit('message', msg, previousNode)
        const neighbors = this.neighbors.getAll().filter((neighbor) => toNodeId(neighbor.getPeerDescriptor()) !== previousNode)
        for (const neighbor of neighbors) {
            if (this.localPausedNeighbors.has(toNodeId(neighbor.getPeerDescriptor()))) {
                const remote = this.createRemote(neighbor.getPeerDescriptor())
                setImmediate(() => remote.sendMetadata(msg.messageId!))
            } else {
                setImmediate(() => neighbor.sendStreamMessage(msg))
            }
        }
    }

    isNeighborPaused(node: PeerDescriptor): boolean {
        return this.localPausedNeighbors.has(toNodeId(node)) || this.remotePausedNeighbors.has(toNodeId(node))
    }

    stop(): void {
        this.neighbors.off('nodeRemoved', this.onNeighborRemoved)
    }
        
}
