import { StreamrClient, Subscription } from 'streamr-client'
import { Gate, Logger, setAbortableInterval, setAbortableTimeout } from '@streamr/utils'
import { StreamID } from '@streamr/protocol'
import { EventEmitter } from 'eventemitter3'
import { NodeID } from '@streamr/trackerless-network'
import min from 'lodash/min'
import once from 'lodash/once'
import { NetworkPeerDescriptor } from 'streamr-client'
import { HeartbeatMessage, HeartbeatMessageSchema } from './heartbeatUtils'

const logger = new Logger(module)

export const DEFAULT_UPDATE_INTERVAL_IN_MS = 1000 * 10

const DEFAULT_PRUNE_AGE_IN_MS = 5 * 60 * 1000

const DEFAULT_PRUNE_INTERVAL_IN_MS = 30 * 1000

const DEFAULT_LATENCY_EXTRA_MS = 2000

export interface OperatorFleetStateEvents {
    added: (nodeId: NodeID) => void
    removed: (nodeId: NodeID) => void
}

interface Heartbeat {
    timestamp: number
    peerDescriptor: NetworkPeerDescriptor
}

export class OperatorFleetState extends EventEmitter<OperatorFleetStateEvents> {
    private readonly streamrClient: StreamrClient
    private readonly coordinationStreamId: StreamID
    private readonly timeProvider: () => number
    private readonly pruneAgeInMs: number
    private readonly pruneIntervalInMs: number
    private readonly heartbeatIntervalInMs: number
    private readonly latencyExtraInMs: number
    private readonly latestHeartbeats = new Map<NodeID, Heartbeat>()
    private readonly abortController = new AbortController()
    private readonly ready = new Gate(false)
    private subscription?: Subscription

    constructor(
        streamrClient: StreamrClient,
        coordinationStreamId: StreamID,
        timeProvider = Date.now,
        pruneAgeInMs = DEFAULT_PRUNE_AGE_IN_MS,
        pruneIntervalInMs = DEFAULT_PRUNE_INTERVAL_IN_MS,
        heartbeatIntervalInMs = DEFAULT_UPDATE_INTERVAL_IN_MS,
        latencyExtraInMs = DEFAULT_LATENCY_EXTRA_MS
    ) {
        super()
        this.streamrClient = streamrClient
        this.coordinationStreamId = coordinationStreamId
        this.timeProvider = timeProvider
        this.pruneAgeInMs = pruneAgeInMs
        this.pruneIntervalInMs = pruneIntervalInMs
        this.heartbeatIntervalInMs = heartbeatIntervalInMs
        this.latencyExtraInMs = latencyExtraInMs
    }

    async start(): Promise<void> {
        if (this.subscription !== undefined) {
            throw new Error('already started')
        }
        this.subscription = await this.streamrClient.subscribe(this.coordinationStreamId, (rawContent) => {
            let message: HeartbeatMessage
            try {
                message = HeartbeatMessageSchema.parse(rawContent)
            } catch (err) {
                logger.warn('Received invalid message in coordination stream', {
                    coordinationStreamId: this.coordinationStreamId,
                    reason: err?.reason
                })
                return
            }
            if (message.msgType === 'heartbeat') {
                const nodeId = message.peerDescriptor.id as NodeID
                const exists = this.latestHeartbeats.has(nodeId)
                this.latestHeartbeats.set(nodeId, {
                    timestamp: this.timeProvider(),
                    peerDescriptor: message.peerDescriptor
                })
				logger.trace(`Got heartbeat: ${nodeId}, ${this.latestHeartbeats.get(nodeId)}`)
                if (!exists) {
                    this.emit('added', nodeId)
                }
                if (!this.ready.isOpen()) {
                    this.launchOpenReadyGateTimer()
                }
            }
        })
        setAbortableInterval(() => this.pruneOfflineNodes(), this.pruneIntervalInMs, this.abortController.signal)
    }

    async waitUntilReady(): Promise<void> {
        return this.ready.waitUntilOpen()
    }

    async destroy(): Promise<void> {
        this.abortController.abort()
        await this.subscription?.unsubscribe()
    }

    getLeaderNodeId(): NodeID | undefined {
        return min(this.getNodeIds()) // we just need the leader to be consistent
    }

    getNodeIds(): NodeID[] {
		const nodeIds = [...this.latestHeartbeats.keys()]
		logger.trace(`getNodeIds: ${nodeIds}`)
        return nodeIds
    }

    getPeerDescriptor(nodeId: NodeID): NetworkPeerDescriptor | undefined {
        return this.latestHeartbeats.get(nodeId)?.peerDescriptor
    }

    private launchOpenReadyGateTimer = once(() => {
        setAbortableTimeout(() => {
            this.ready.open()
        }, this.heartbeatIntervalInMs + this.latencyExtraInMs, this.abortController.signal)
    })

    private pruneOfflineNodes(): void {
        const now = this.timeProvider()
        for (const [nodeId, { timestamp }] of this.latestHeartbeats) {
            if (now - timestamp >= this.pruneAgeInMs) {
				logger.trace(`Pruning ${nodeId}, latest heartbeat: ${timestamp}, age: ${now - timestamp}`)
                this.latestHeartbeats.delete(nodeId)
                this.emit('removed', nodeId)
            }
        }
    }
}
