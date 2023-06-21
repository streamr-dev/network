import { StreamrClient, Subscription } from 'streamr-client'
import { Logger } from '@streamr/utils'
import { StreamID } from '@streamr/protocol'
import { EventEmitter } from 'eventemitter3'

const logger = new Logger(module)

export const PRUNE_AGE_IN_MS = 5 * 60 * 1000

const DEFAULT_PRUNE_INTERVAL_IN_MS = 30 * 1000

interface OperatorFleetStateEvents {
    cameOnline: (nodeId: string) => void
    wentOffline: (nodeId: string) => void
}

export class OperatorFleetState extends EventEmitter<OperatorFleetStateEvents> {
    private readonly nodes = new Map<string, number>()
    private readonly streamrClient: StreamrClient
    private readonly coordinationStream: StreamID
    private readonly timeProvider: () => number
    private readonly pruneIntervalInMs: number
    private subscription?: Subscription
    private pruneNodesIntervalRef?: NodeJS.Timeout

    constructor(
        streamrClient: StreamrClient,
        coordinationStream: StreamID,
        timeProvider = Date.now,
        pruneIntervalInMs = DEFAULT_PRUNE_INTERVAL_IN_MS
    ) {
        super()
        this.streamrClient = streamrClient
        this.coordinationStream = coordinationStream
        this.timeProvider = timeProvider
        this.pruneIntervalInMs = pruneIntervalInMs
    }

    async start(): Promise<void> {
        if (this.subscription !== undefined) {
            throw new Error('already started')
        }
        this.subscription = await this.streamrClient.subscribe(this.coordinationStream)
        this.pruneNodesIntervalRef = setInterval(() => this.pruneOfflineNodes(), this.pruneIntervalInMs)
        for await (const msg of this.subscription) {
            const { msgType, nodeId } = (msg.content as Record<string, unknown>)
            if (typeof msgType !== 'string' || typeof nodeId !== 'string') {
                logger.warn('Received invalid message in coordination stream', {
                    coordinationStream: this.coordinationStream,
                })
                return
            }
            const exists = this.nodes.has(nodeId)
            this.nodes.set(nodeId, this.timeProvider())
            if (!exists) {
                this.emit('cameOnline', nodeId)
            }
        }
    }

    async destroy(): Promise<void> {
        clearInterval(this.pruneNodesIntervalRef)
        await this.subscription?.unsubscribe()
    }

    getNodeIds(): string[] {
        this.pruneOfflineNodes()
        return [...this.nodes.keys()]
    }

    private pruneOfflineNodes(): void {
        const now = this.timeProvider()
        for (const [nodeId, time] of this.nodes) {
            if (now - time >= PRUNE_AGE_IN_MS) {
                this.nodes.delete(nodeId)
                this.emit('wentOffline', nodeId)
            }
        }
    }
}
