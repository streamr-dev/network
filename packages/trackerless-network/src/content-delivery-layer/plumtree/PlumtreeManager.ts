import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { 
    MessageID,
    PauseNeighborRequest,
    PauseNeighborResponse,
    ResumeNeighborRequest,
    StreamMessage
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NodeList } from '../NodeList'
import { PlumtreeRpcLocal } from './PlumtreeRpcLocal'
import { PlumtreeRpcRemote } from './PlumtreeRpcRemote'
import { ContentDeliveryRpcClient, PlumtreeRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { EventEmitter } from 'eventemitter3'
import { Logger, setAbortableInterval } from '@streamr/utils'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { PausedNeighbors } from './PausedNeighbors'

interface RecoveryState {
    timestampsAhead: Set<number>
    metadataAheadSince: number
    candidates: PeerDescriptor[]
    lastAttemptedNode: PeerDescriptor | null
    resumeInProgress: boolean
}

interface Options {
    neighbors: NodeList
    localPeerDescriptor: PeerDescriptor
    rpcCommunicator: ListeningRpcCommunicator
    maxPausedNeighbors?: number
    recoveryTimeout?: number
    recoveryCheckInterval?: number
    recoveryCooldown?: number
}

export const MAX_PAUSED_NEIGHBORS_DEFAULT = 3
const DEFAULT_RECOVERY_TIMEOUT = 500
const DEFAULT_RECOVERY_CHECK_INTERVAL = 200
const DEFAULT_RECOVERY_COOLDOWN = 2500
const logger = new Logger('PlumtreeManager')

interface Events {
    message: (msg: StreamMessage) => void
}

export class PlumtreeManager extends EventEmitter<Events> {
    private readonly neighbors: NodeList
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly localPausedNeighbors: PausedNeighbors
    private readonly remotePausedNeighbors: PausedNeighbors
    private readonly rpcLocal: PlumtreeRpcLocal
    private readonly latestMessages: Map<string, StreamMessage[]> = new Map()
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly maxPausedNeighbors: number
    private readonly recoveryState: Map<string, RecoveryState> = new Map()
    private readonly recoveryCooldownUntil: Map<string, number> = new Map()
    private readonly recoveryTimeout: number
    private readonly recoveryCooldown: number
    private readonly abortController: AbortController = new AbortController()

    constructor(options: Options) {
        super()
        this.neighbors = options.neighbors
        this.maxPausedNeighbors = options.maxPausedNeighbors ?? MAX_PAUSED_NEIGHBORS_DEFAULT
        this.localPeerDescriptor = options.localPeerDescriptor
        this.localPausedNeighbors = new PausedNeighbors(options.maxPausedNeighbors ?? MAX_PAUSED_NEIGHBORS_DEFAULT)
        this.remotePausedNeighbors = new PausedNeighbors(options.maxPausedNeighbors ?? MAX_PAUSED_NEIGHBORS_DEFAULT)
        this.recoveryTimeout = options.recoveryTimeout ?? DEFAULT_RECOVERY_TIMEOUT
        this.recoveryCooldown = options.recoveryCooldown ?? DEFAULT_RECOVERY_COOLDOWN
        this.rpcLocal = new PlumtreeRpcLocal(
            this.neighbors,
            this.localPausedNeighbors,
            (metadata: MessageID, previousNode: PeerDescriptor) => this.onMetadata(metadata, previousNode),
            (fromTimestamp: number, msgChainId: string, remotePeerDescriptor: PeerDescriptor) => 
                this.sendBuffer(fromTimestamp, msgChainId, remotePeerDescriptor)
        )
        this.neighbors.on('nodeRemoved', this.onNeighborRemoved)
        this.rpcCommunicator = options.rpcCommunicator
        this.rpcCommunicator.registerRpcNotification(MessageID, 'sendMetadata', (msg: MessageID, context) => this.rpcLocal.sendMetadata(msg, context))
        this.rpcCommunicator.registerRpcMethod(
            PauseNeighborRequest,
            PauseNeighborResponse,
            'pauseNeighbor',
            (msg: PauseNeighborRequest, context) => this.rpcLocal.pauseNeighbor(msg, context))
        this.rpcCommunicator.registerRpcNotification(
            ResumeNeighborRequest,
            'resumeNeighbor', (msg: ResumeNeighborRequest, context) => this.rpcLocal.resumeNeighbor(msg, context))

        setAbortableInterval(() => {
            const now = performance.now()
            for (const [chainId, state] of this.recoveryState) {
                if (now - state.metadataAheadSince >= this.recoveryTimeout && !state.resumeInProgress) {
                    this.attemptRecovery(chainId, state, this.getLatestMessageTimestamp(chainId))
                }
            }
        }, options.recoveryCheckInterval ?? DEFAULT_RECOVERY_CHECK_INTERVAL, this.abortController.signal)
    }

    async pauseNeighbor(node: PeerDescriptor, msgChainId: string): Promise<void> {
        if (this.neighbors.has(toNodeId(node)) 
            && !this.remotePausedNeighbors.isPaused(toNodeId(node), msgChainId)
            && this.remotePausedNeighbors.size(msgChainId) < this.maxPausedNeighbors) {
            logger.debug(`Pausing neighbor ${toNodeId(node)}`)
            this.remotePausedNeighbors.add(toNodeId(node), msgChainId)
            try {
                const remote = this.createRemote(node)
                const accepted = await remote.pauseNeighbor(msgChainId)
                if (!accepted) {
                    this.remotePausedNeighbors.delete(toNodeId(node), msgChainId)
                }
            } catch (_e) {
                this.remotePausedNeighbors.delete(toNodeId(node), msgChainId)
            }
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

    private onNeighborRemoved = (nodeId: DhtAddress): void => {
        this.localPausedNeighbors.deleteAll(nodeId)
        this.remotePausedNeighbors.deleteAll(nodeId)

        for (const [_chainId, state] of this.recoveryState) {
            state.candidates = state.candidates.filter((c) => toNodeId(c) !== nodeId)
            if (state.lastAttemptedNode !== null && toNodeId(state.lastAttemptedNode) === nodeId) {
                state.lastAttemptedNode = null
            }
        }

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
        for (const msg of messages) {
            await remote.sendStreamMessage(msg)
        }
    }

    private async onMetadata(msg: MessageID, previousNode: PeerDescriptor): Promise<void> {
        const latestTs = this.getLatestMessageTimestamp(msg.messageChainId)
        if (latestTs >= msg.timestamp) {
            return
        }
        const chainId = msg.messageChainId

        const cooldownUntil = this.recoveryCooldownUntil.get(chainId)
        if (cooldownUntil !== undefined && performance.now() < cooldownUntil) {
            return
        }

        let state = this.recoveryState.get(chainId)
        if (!state) {
            state = {
                timestampsAhead: new Set(),
                metadataAheadSince: performance.now(),
                candidates: [],
                lastAttemptedNode: null,
                resumeInProgress: false
            }
            this.recoveryState.set(chainId, state)
        }
        state.timestampsAhead.add(msg.timestamp)

        const nodeId = toNodeId(previousNode)
        const isLastAttempted = state.lastAttemptedNode !== null && toNodeId(state.lastAttemptedNode) === nodeId
        if (!isLastAttempted && !state.candidates.some((c) => toNodeId(c) === nodeId)) {
            state.candidates.push(previousNode)
        }

        if (state.timestampsAhead.size > 1 && !state.resumeInProgress) {
            await this.attemptRecovery(chainId, state, latestTs)
        }
    }

    private async attemptRecovery(chainId: string, state: RecoveryState, latestTs: number): Promise<void> {
        const candidate = state.candidates.shift()
        if (!candidate) {
            state.metadataAheadSince = performance.now()
            return
        }

        state.resumeInProgress = true
        state.lastAttemptedNode = candidate
        state.candidates = []
        state.timestampsAhead.clear()
        state.metadataAheadSince = performance.now()

        try {
            const remote = this.createRemote(candidate)
            await remote.resumeNeighbor(latestTs, chainId)
        } catch (_e) {
            logger.debug('Recovery resume failed, will retry with next candidate')
        } finally {
            state.resumeInProgress = false
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

        const state = this.recoveryState.get(messageChainId)
        if (state) {
            if (state.lastAttemptedNode) {
                this.remotePausedNeighbors.delete(toNodeId(state.lastAttemptedNode), messageChainId)
            }
            this.recoveryState.delete(messageChainId)
            this.recoveryCooldownUntil.set(messageChainId, performance.now() + this.recoveryCooldown)
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

    getLocalPausedNeighbors(): PausedNeighbors {
        return this.localPausedNeighbors
    }

    getRemotePausedNeighbors(): PausedNeighbors {
        return this.remotePausedNeighbors
    }

    stop(): void {
        this.abortController.abort()
        this.neighbors.off('nodeRemoved', this.onNeighborRemoved)
        this.latestMessages.clear()
        this.recoveryState.clear()
        this.recoveryCooldownUntil.clear()
    }
        
}
