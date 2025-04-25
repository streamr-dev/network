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
import { PlumTreeRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import EventEmitter from 'eventemitter3'
import { Logger } from '@streamr/utils'

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
    private localPausedNeighbors: Set<DhtAddress>
    private remotePausedNeighbors: Set<DhtAddress> = new Set()
    private rpcLocal: PlumTreeRpcLocal
    private lastMessages: StreamMessage[] = []
    private rpcCommunicator: ListeningRpcCommunicator

    constructor(options: Options) {
        super()
        this.neighbors = options.neighbors
        this.localPausedNeighbors = new Set()
        this.localPeerDescriptor = options.localPeerDescriptor
        this.rpcLocal = new PlumTreeRpcLocal(
            this.localPausedNeighbors,
            (metadata: MessageID, previousNode: PeerDescriptor) => this.onMetadata(metadata, previousNode),
            (fromTimestamp: number) => this.sendBuffer(fromTimestamp)
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
        logger.debug(`Pausing neighbor ${toNodeId(node)}`)
        this.remotePausedNeighbors.add(toNodeId(node))
        const remote = this.createRemote(node)
        await remote.pauseNeighbor()
    }

    async resumeNeighbor(node: PeerDescriptor, fromTimestamp: number): Promise<void> {
        if (this.remotePausedNeighbors.has(toNodeId(node))) {
            logger.debug(`Resuming neighbor ${toNodeId(node)}`)
            this.remotePausedNeighbors.delete(toNodeId(node))
            this.localPausedNeighbors.delete(toNodeId(node))
            const remote = this.createRemote(node)
            await remote.resumeNeighbor(fromTimestamp)
        }
    }

    getLatestMessageTimestamp(): number {
        if (this.lastMessages.length === 0) {
            return 0
        }
        return this.lastMessages[this.lastMessages.length - 1]!.messageId!.timestamp
    }

    sendBuffer(fromTimestamp: number): void {
        for (const msg of this.lastMessages) {
            if (msg.messageId!.timestamp >= fromTimestamp) {
                this.broadcast(msg, toNodeId(this.localPeerDescriptor))
            }
        }
    }

    async onMetadata(msg: MessageID, previousNode: PeerDescriptor): Promise<void> {
        // Check that the message is found in the last 20 messages
        // If not resume the sending neighbor 
        if (this.lastMessages.find((m) => m.messageId!.timestamp < msg.timestamp)) {
            await this.resumeNeighbor(previousNode, this.getLatestMessageTimestamp())
        }
    }

    createRemote(neighbor: PeerDescriptor): PlumTreeRpcRemote {
        return new PlumTreeRpcRemote(this.localPeerDescriptor, neighbor, this.rpcCommunicator, PlumTreeRpcClient)
    }

    broadcast(msg: StreamMessage, previousNode: DhtAddress): void {
        if (this.lastMessages.length < 20) {
            this.lastMessages.push(msg)
        } else {
            this.lastMessages.shift()
            this.lastMessages.push(msg)
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
