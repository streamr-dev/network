import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { 
    MessageID,
    PauseNeighborRequest,
    ResumeNeighborRequest,
    StreamMessage
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NodeList } from '../NodeList'
import { PlumtreeRpcLocal } from './PlumtreeRpcLocal'
import { PlumtreeRpcRemote } from './PlumtreeRpcRemote'
import { ContentDeliveryRpcClient, PlumtreeRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { EventEmitter } from 'eventemitter3'
import { Logger } from '@streamr/utils'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { PausedNeighbors } from './PausedNeighbors'

interface Options {
    neighbors: NodeList
    localPeerDescriptor: PeerDescriptor
    rpcCommunicator: ListeningRpcCommunicator
    maxPausedNeighbors?: number
}

export const MAX_PAUSED_NEIGHBORS_DEFAULT = 3
const logger = new Logger('PlumtreeManager')

interface Events {
    message: (msg: StreamMessage) => void
}

export class PlumtreeManager extends EventEmitter<Events> {
    private readonly neighbors: NodeList
    private readonly localPeerDescriptor: PeerDescriptor
    // We have paused sending real data to these neighbrs and only send metadata
    private readonly localPausedNeighbors: PausedNeighbors
    // We have asked these nodes to pause sending real data to us, used to limit sending of pausing and resuming requests
    private readonly remotePausedNeighbors: PausedNeighbors
    private readonly rpcLocal: PlumtreeRpcLocal
    private readonly latestMessages: Map<string, StreamMessage[]> = new Map()
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly metadataTimestampsAheadOfRealData: Map<string, Set<number>> = new Map()
    private readonly maxPausedNeighbors: number
    constructor(options: Options) {
        super()
        this.neighbors = options.neighbors
        this.maxPausedNeighbors = options.maxPausedNeighbors ?? MAX_PAUSED_NEIGHBORS_DEFAULT
        this.localPeerDescriptor = options.localPeerDescriptor
        this.localPausedNeighbors = new PausedNeighbors(options.maxPausedNeighbors ?? MAX_PAUSED_NEIGHBORS_DEFAULT)
        this.remotePausedNeighbors = new PausedNeighbors(options.maxPausedNeighbors ?? MAX_PAUSED_NEIGHBORS_DEFAULT)
        this.rpcLocal = new PlumtreeRpcLocal(
            this.neighbors,
            this.localPausedNeighbors,
            (metadata: MessageID, previousNode: PeerDescriptor) => this.onMetadata(metadata, previousNode),
            (fromTimestamp: number, msgChainId: string, remotePeerDescriptor: PeerDescriptor) => 
                this.sendBuffer(fromTimestamp, msgChainId, remotePeerDescriptor)
        )
        this.neighbors.on('nodeRemoved', (nodeId: DhtAddress) => this.onNeighborRemoved(nodeId))
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

    async pauseNeighbor(node: PeerDescriptor, msgChainId: string): Promise<void> {
        if (this.neighbors.has(toNodeId(node)) 
            && !this.remotePausedNeighbors.isPaused(toNodeId(node), msgChainId)
            && this.remotePausedNeighbors.size(msgChainId) < this.maxPausedNeighbors) {
            logger.debug(`Pausing neighbor ${toNodeId(node)}`)
            this.remotePausedNeighbors.add(toNodeId(node), msgChainId)
            const remote = this.createRemote(node)
            await remote.pauseNeighbor(msgChainId)
        }
    }

    async resumeNeighbor(node: PeerDescriptor, msgChainId: string, fromTimestamp: number): Promise<void> {
        if (this.remotePausedNeighbors.isPaused(toNodeId(node), msgChainId)) {
            logger.debug(`Resuming neighbor ${toNodeId(node)}`)
            this.remotePausedNeighbors.delete(toNodeId(node), msgChainId)
            const remote = this.createRemote(node)
            await remote.resumeNeighbor(fromTimestamp, msgChainId)
        }
    }

    private onNeighborRemoved(nodeId: DhtAddress): void {
        this.localPausedNeighbors.deleteAll(nodeId)
        this.remotePausedNeighbors.deleteAll(nodeId)
        if (this.neighbors.size() > 0) {
            this.remotePausedNeighbors.forEach((pausedNeighbors, msgChainId) => {
                if (pausedNeighbors.size >= this.neighbors.size()) {
                    logger.debug('All neighbors are paused, resuming first neighbor')
                    const neighborToResume = this.neighbors.getFirst([])!.getPeerDescriptor()
                    setImmediate(() => this.resumeNeighbor(
                        neighborToResume,
                        msgChainId,
                        this.getLatestMessageTimestamp(msgChainId)
                    ))
                }
            })
        }
    }

    getLatestMessageTimestamp(msgChainId: string): number {
        if (!this.latestMessages.has(msgChainId) || this.latestMessages.get(msgChainId)!.length === 0) {
            return 0
        }
        return this.latestMessages.get(msgChainId)![this.latestMessages.get(msgChainId)!.length - 1].messageId!.timestamp
    }

    private async sendBuffer(fromTimestamp: number, msgChainId: string, neighbor: PeerDescriptor): Promise<void> {
        const remote = new ContentDeliveryRpcRemote(this.localPeerDescriptor, neighbor, this.rpcCommunicator, ContentDeliveryRpcClient)
        const messages = this.latestMessages.get(msgChainId)?.filter((msg) => msg.messageId!.timestamp > fromTimestamp) ?? []
        await Promise.all(messages.map((msg) => remote.sendStreamMessage(msg)))
    }

    private async onMetadata(msg: MessageID, previousNode: PeerDescriptor): Promise<void> {
        // If we receive newer metadata than messages in the buffer, resume the sending neighbor
        const latestMessageTimestamp = this.getLatestMessageTimestamp(msg.messageChainId)
        if (latestMessageTimestamp < msg.timestamp) {
            if (!this.metadataTimestampsAheadOfRealData.has(msg.messageChainId)) {
                this.metadataTimestampsAheadOfRealData.set(msg.messageChainId, new Set())
            }
            this.metadataTimestampsAheadOfRealData.get(msg.messageChainId)!.add(msg.timestamp)
            if (this.metadataTimestampsAheadOfRealData.get(msg.messageChainId)!.size > 1) {
                await this.resumeNeighbor(previousNode, msg.messageChainId, this.getLatestMessageTimestamp(msg.messageChainId))
                this.metadataTimestampsAheadOfRealData.get(msg.messageChainId)!.forEach((timestamp) => {
                    this.metadataTimestampsAheadOfRealData.get(msg.messageChainId)!.delete(timestamp)
                })
            }
        }
    }

    private createRemote(neighbor: PeerDescriptor): PlumtreeRpcRemote {
        return new PlumtreeRpcRemote(this.localPeerDescriptor, neighbor, this.rpcCommunicator, PlumtreeRpcClient)
    }

    broadcast(msg: StreamMessage, previousNode: DhtAddress): void {
        const messageChainId = msg.messageId!.messageChainId
        if (!this.latestMessages.has(messageChainId)) {
            this.latestMessages.set(messageChainId, [])
        }
        if (this.latestMessages.get(messageChainId)!.length < 20) {
            this.latestMessages.get(messageChainId)!.push(msg)
        } else {
            this.latestMessages.get(messageChainId)!.shift()
            this.latestMessages.get(messageChainId)!.push(msg)
        }
        if (this.metadataTimestampsAheadOfRealData.has(msg.messageId!.messageChainId)) {
            this.metadataTimestampsAheadOfRealData.get(msg.messageId!.messageChainId)!.delete(msg.messageId!.timestamp)
        }
        this.emit('message', msg)
        const neighbors = this.neighbors.getAll().filter((neighbor) => toNodeId(neighbor.getPeerDescriptor()) !== previousNode)
        for (const neighbor of neighbors) {
            if (this.localPausedNeighbors.isPaused(toNodeId(neighbor.getPeerDescriptor()), msg.messageId!.messageChainId)) {
                const remote = this.createRemote(neighbor.getPeerDescriptor())
                setImmediate(() => remote.sendMetadata(msg.messageId!))
            } else {
                setImmediate(() => neighbor.sendStreamMessage(msg))
            }
        }
    }

    isNeighborPaused(node: PeerDescriptor, msgChainId: string): boolean {
        return this.localPausedNeighbors.isPaused(toNodeId(node), msgChainId) 
            || this.remotePausedNeighbors.isPaused(toNodeId(node), msgChainId)
    }

    stop(): void {
        this.neighbors.off('nodeRemoved', this.onNeighborRemoved)
    }
        
}
