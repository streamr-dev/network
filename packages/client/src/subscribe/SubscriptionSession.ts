import { StreamMessage, StreamMessageType, StreamPartID } from '@streamr/protocol'
import { JsonPeerDescriptor } from '../Config'
import { NetworkNodeFacade, NetworkNodeStub } from '../NetworkNodeFacade'
import { Scaffold } from '../utils/Scaffold'
import { Signal } from '../utils/Signal'
import { entryPointTranslator } from '../utils/utils'
import { MessagePipelineFactory } from './MessagePipelineFactory'
import { MessageStream } from './MessageStream'
import { Subscription } from './Subscription'
import { PeerDescriptor } from '@streamr/dht'

/**
 * Manages adding & removing subscriptions to node as needed.
 * A session contains one or more subscriptions to a single streamId + streamPartition pair.
 */

export class SubscriptionSession {

    public readonly streamPartId: StreamPartID
    public readonly onRetired = Signal.once()
    private isRetired: boolean = false
    private isStopped = false
    private readonly subscriptions: Set<Subscription> = new Set()
    private readonly pendingRemoval: WeakSet<Subscription> = new WeakSet()
    private readonly pipeline: MessageStream
    private readonly node: NetworkNodeFacade
    private readonly knownEntryPoints: PeerDescriptor[]
    constructor(
        streamPartId: StreamPartID,
        messagePipelineFactory: MessagePipelineFactory,
        node: NetworkNodeFacade,
        knownEntryPoints?: JsonPeerDescriptor[]
    ) {
        this.streamPartId = streamPartId
        this.distributeMessage = this.distributeMessage.bind(this)
        this.node = node
        this.onError = this.onError.bind(this)
        this.pipeline = messagePipelineFactory.createMessagePipeline({
            streamPartId
        })
        this.pipeline.onError.listen(this.onError)
        this.pipeline
            .pipe(this.distributeMessage)
            .onBeforeFinally.listen(async () => {
                if (!this.isStopped) {
                    await this.stop()
                }
            })
        this.pipeline.flow()
        this.knownEntryPoints = knownEntryPoints ? entryPointTranslator(knownEntryPoints) : []
    }

    private async retire(): Promise<void> {
        if (this.isRetired) {
            return
        }

        this.isRetired = true
        await this.onRetired.trigger()
    }

    private async onError(error: Error): Promise<void> {
        // eslint-disable-next-line promise/no-promise-in-callback
        await Promise.allSettled([...this.subscriptions].map(async (sub) => {
            await sub.handleError(error)
        }))
    }

    async* distributeMessage(src: AsyncGenerator<StreamMessage>): AsyncGenerator<StreamMessage, void, unknown> {
        for await (const msg of src) {
            await Promise.all([...this.subscriptions].map(async (sub) => {
                await sub.push(msg)
            }))
            yield msg
        }
    }

    private onMessageInput = async (msg: StreamMessage) => {
        if (!msg || this.isStopped || this.isRetired) {
            return
        }

        if (msg.getStreamPartID() !== this.streamPartId) {
            return
        }

        if (msg.messageType !== StreamMessageType.MESSAGE) {
            return
        }

        const tasks = []
        let hasNormalSubscriptions = false
        for (const sub of this.subscriptions.values()) {
            if (sub.isRaw) {
                tasks.push(sub.push(msg))
            } else {
                hasNormalSubscriptions = true
            }
        }
        if (hasNormalSubscriptions) {
            tasks.push(this.pipeline.push(msg))
        }
        await Promise.all(tasks)
    }

    private async subscribe(): Promise<NetworkNodeStub> {
        const node = await this.node.getNode()
        node.addMessageListener(this.onMessageInput)
        await node.subscribe(this.streamPartId, this.knownEntryPoints)
        return node
    }

    private async unsubscribe(node: NetworkNodeStub): Promise<void> {
        this.pipeline.end()
        this.pipeline.return()
        this.pipeline.onError.end(new Error('done'))
        node.removeMessageListener(this.onMessageInput)
        node.unsubscribe(this.streamPartId)
    }

    updateNodeSubscriptions = (() => {
        let node: NetworkNodeStub | undefined
        return Scaffold([
            async () => {
                node = await this.subscribe()
                return async () => {
                    const prevNode = node
                    node = undefined
                    await this.unsubscribe(prevNode!)
                    await this.stop()
                }
            },
        ], () => this.shouldBeSubscribed())
    })()

    async updateSubscriptions(): Promise<void> {
        await this.updateNodeSubscriptions()
        if (!this.shouldBeSubscribed() && !this.isStopped) {
            await this.stop()
        }
    }

    shouldBeSubscribed(): boolean {
        return !this.isRetired && !this.isStopped && !!this.count()
    }

    async stop(): Promise<void> {
        this.isStopped = true
        this.pipeline.end()
        await this.retire()
        await this.pipeline.return()
    }

    has(sub: Subscription): boolean {
        return this.subscriptions.has(sub)
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Subscription): Promise<void> {
        if (!sub || this.subscriptions.has(sub) || this.pendingRemoval.has(sub)) { return } // already has
        this.subscriptions.add(sub)

        sub.onBeforeFinally.listen(() => {
            return this.remove(sub)
        })

        await this.updateSubscriptions()
    }

    /**
     * Remove subscription & appropriate connection handle.
     */

    async remove(sub: Subscription): Promise<void> {
        if (!sub || this.pendingRemoval.has(sub) || !this.subscriptions.has(sub)) {
            return
        }

        this.pendingRemoval.add(sub)
        this.subscriptions.delete(sub)

        try {
            if (!sub.isDone()) {
                await sub.unsubscribe()
            }
        } finally {
            await this.updateSubscriptions()
        }
    }

    /**
     * How many subscriptions
     */
    count(): number {
        return this.subscriptions.size
    }
}
