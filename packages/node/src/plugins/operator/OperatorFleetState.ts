import { DhtAddress } from '@streamr/dht'
import { NetworkPeerDescriptor, StreamrClient, Subscription } from '@streamr/sdk'
import { Gate, Logger, StreamID, setAbortableInterval, setAbortableTimeout } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import min from 'lodash/min'
import once from 'lodash/once'
import { HeartbeatMessage, HeartbeatMessageSchema } from './heartbeatUtils'

const logger = new Logger(module)

export interface OperatorFleetStateEvents {
    added: (nodeId: DhtAddress) => void
    removed: (nodeId: DhtAddress) => void
}

interface Heartbeat {
    timestamp: number
    peerDescriptor: NetworkPeerDescriptor
}

export type CreateOperatorFleetStateFn = (coordinationStreamId: StreamID) => OperatorFleetState

// TODO: add abortSignal support
export class OperatorFleetState extends EventEmitter<OperatorFleetStateEvents> {
    private readonly streamrClient: StreamrClient
    private readonly coordinationStreamId: StreamID
    private readonly timeProvider: () => number
    private readonly pruneAgeInMs: number
    private readonly pruneIntervalInMs: number
    private readonly heartbeatIntervalInMs: number
    private readonly latencyExtraInMs: number
    private readonly warmupPeriodInMs: number
    private readonly latestHeartbeats = new Map<DhtAddress, Heartbeat>()
    private readonly abortController = new AbortController()
    private readonly ready = new Gate(false)
    private subscription?: Subscription

    static createOperatorFleetStateBuilder(
        streamrClient: StreamrClient,
        heartbeatIntervalInMs: number,
        pruneAgeInMs: number,
        pruneIntervalInMs: number,
        latencyExtraInMs: number,
        warmupPeriodInMs: number,
        timeProvider = Date.now
    ): CreateOperatorFleetStateFn {
        return (coordinationStreamId) =>
            new OperatorFleetState(
                streamrClient,
                coordinationStreamId,
                heartbeatIntervalInMs,
                pruneAgeInMs,
                pruneIntervalInMs,
                latencyExtraInMs,
                warmupPeriodInMs,
                timeProvider
            )
    }

    private constructor(
        streamrClient: StreamrClient,
        coordinationStreamId: StreamID,
        heartbeatIntervalInMs: number,
        pruneAgeInMs: number,
        pruneIntervalInMs: number,
        latencyExtraInMs: number,
        warmupPeriodInMs: number,
        timeProvider = Date.now
    ) {
        super()
        this.streamrClient = streamrClient
        this.coordinationStreamId = coordinationStreamId
        this.timeProvider = timeProvider
        this.pruneAgeInMs = pruneAgeInMs
        this.pruneIntervalInMs = pruneIntervalInMs
        this.heartbeatIntervalInMs = heartbeatIntervalInMs
        this.latencyExtraInMs = latencyExtraInMs
        this.warmupPeriodInMs = warmupPeriodInMs
    }

    async start(): Promise<void> {
        if (this.subscription !== undefined) {
            throw new Error('already started')
        }
        const startTime = this.timeProvider()
        this.subscription = await this.streamrClient.subscribe(this.coordinationStreamId, (rawContent) => {
            // Ignore messages during warmup period. This is needed because network nodes may propagate old stream messages
            // from cache.
            if (this.timeProvider() - startTime < this.warmupPeriodInMs) {
                // TODO: write test
                return
            }

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
                const nodeId = message.peerDescriptor.nodeId as DhtAddress
                const exists = this.latestHeartbeats.has(nodeId)
                this.latestHeartbeats.set(nodeId, {
                    timestamp: this.timeProvider(),
                    peerDescriptor: message.peerDescriptor
                })
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

    getLeaderNodeId(): DhtAddress | undefined {
        return min(this.getNodeIds()) // we just need the leader to be consistent
    }

    getNodeIds(): DhtAddress[] {
        return [...this.latestHeartbeats.keys()]
    }

    getPeerDescriptor(nodeId: DhtAddress): NetworkPeerDescriptor | undefined {
        return this.latestHeartbeats.get(nodeId)?.peerDescriptor
    }

    private launchOpenReadyGateTimer = once(() => {
        setAbortableTimeout(
            () => {
                this.ready.open()
            },
            this.heartbeatIntervalInMs + this.latencyExtraInMs,
            this.abortController.signal
        )
    })

    private pruneOfflineNodes(): void {
        const now = this.timeProvider()
        for (const [nodeId, { timestamp }] of this.latestHeartbeats) {
            if (now - timestamp >= this.pruneAgeInMs) {
                this.latestHeartbeats.delete(nodeId)
                this.emit('removed', nodeId)
            }
        }
    }
}
