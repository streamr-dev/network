import { StreamrClient, Subscription } from 'streamr-client'
import { Logger } from '@streamr/utils'
import { StreamID } from '@streamr/protocol'
import { EventEmitter } from 'eventemitter3'

const logger = new Logger(module)

const DEFAULT_PRUNE_AGE_IN_MS = 5 * 60 * 1000

const DEFAULT_PRUNE_INTERVAL_IN_MS = 30 * 1000

interface OperatorFleetStateEvents {
    added: (nodeId: string) => void
    removed: (nodeId: string) => void
}

export class OperatorFleetState extends EventEmitter<OperatorFleetStateEvents> {
    private readonly streamrClient: StreamrClient
    private readonly coordinationStreamId: StreamID
    private readonly timeProvider: () => number
    private readonly pruneAgeInMs: number
    private readonly pruneIntervalInMs: number
    private readonly nodeActivityTimestamps = new Map<string, number>()
    private subscription?: Subscription
    private pruneNodesIntervalRef?: NodeJS.Timeout

    constructor(
        streamrClient: StreamrClient,
        coordinationStreamId: StreamID,
        timeProvider = Date.now,
        pruneAgeInMs = DEFAULT_PRUNE_AGE_IN_MS,
        pruneIntervalInMs = DEFAULT_PRUNE_INTERVAL_IN_MS
    ) {
        super()
        this.streamrClient = streamrClient
        this.coordinationStreamId = coordinationStreamId
        this.timeProvider = timeProvider
        this.pruneAgeInMs = pruneAgeInMs
        this.pruneIntervalInMs = pruneIntervalInMs
    }

    async start(): Promise<void> {
        if (this.subscription !== undefined) {
            throw new Error('already started')
        }
        this.subscription = await this.streamrClient.subscribe(this.coordinationStreamId, (content) => {
            const { msgType, nodeId } = (content as Record<string, unknown>)
            if (typeof msgType !== 'string' || typeof nodeId !== 'string') {
                logger.warn('Received invalid message in coordination stream', {
                    coordinationStreamId: this.coordinationStreamId,
                })
                return
            }
            const exists = this.nodeActivityTimestamps.has(nodeId)
            this.nodeActivityTimestamps.set(nodeId, this.timeProvider())
            if (!exists) {
                this.emit('added', nodeId)
            }
        })
        this.pruneNodesIntervalRef = setInterval(() => this.pruneOfflineNodes(), this.pruneIntervalInMs)
    }

    async destroy(): Promise<void> {
        clearInterval(this.pruneNodesIntervalRef)
        await this.subscription?.unsubscribe()
    }

    getNodeIds(): string[] {
        return [...this.nodeActivityTimestamps.keys()]
    }

    private pruneOfflineNodes(): void {
        const now = this.timeProvider()
        for (const [nodeId, time] of this.nodeActivityTimestamps) {
            if (now - time >= this.pruneAgeInMs) {
                this.nodeActivityTimestamps.delete(nodeId)
                this.emit('removed', nodeId)
            }
        }
    }
}
