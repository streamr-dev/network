import { DependencyContainer, inject } from 'tsyringe'

import { StreamMessage, StreamPartID } from 'streamr-client-protocol'

import { Scaffold, instanceId } from '../utils'
import { until } from '../utils/promises'
import { Context } from '../utils/Context'
import { Signal } from '../utils/Signal'
import { MessageStream } from './MessageStream'

import { Subscription } from './Subscription'
import { SubscribePipeline } from './SubscribePipeline'
import { BrubeckContainer } from '../Container'
import { BrubeckNode, NetworkNodeStub } from '../BrubeckNode'

/**
 * Manages adding & removing subscriptions to node as needed.
 * A session contains one or more subscriptions to a single streamId + streamPartition pair.
 */

export class SubscriptionSession<T> implements Context {
    readonly id
    readonly debug
    public readonly streamPartId: StreamPartID
    /** active subs */
    private subscriptions: Set<Subscription<T>> = new Set()
    private pendingRemoval: WeakSet<Subscription<T>> = new WeakSet()
    private isRetired: boolean = false
    private isStopped = false
    private pipeline
    private node
    public readonly onRetired = Signal.once()

    constructor(
        context: Context,
        streamPartId: StreamPartID,
        @inject(BrubeckContainer) container: DependencyContainer
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.streamPartId = streamPartId
        this.distributeMessage = this.distributeMessage.bind(this)
        this.node = container.resolve<BrubeckNode>(BrubeckNode)
        this.onError = this.onError.bind(this)
        this.pipeline = SubscribePipeline<T>(new MessageStream<T>(this), this.streamPartId, this, container)
        this.pipeline.onError.listen(this.onError)
        this.pipeline
            .pipe(this.distributeMessage)
            .onBeforeFinally.listen(async () => {
                if (!this.isStopped) {
                    await this.stop()
                }
            })
        this.pipeline.flow()
    }

    private async retire(): Promise<void> {
        if (this.isRetired) {
            return
        }

        this.isRetired = true
        await this.onRetired.trigger()
    }

    private async onError(error: Error): Promise<void> {
        await Promise.allSettled([...this.subscriptions].map(async (sub) => {
            await sub.handleError(error)
        }))
    }

    async* distributeMessage(src: AsyncGenerator<StreamMessage<T>>): AsyncGenerator<StreamMessage<T>, void, unknown> {
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

        await this.pipeline.push(msg as StreamMessage<T>)
    }

    private async subscribe(): Promise<NetworkNodeStub> {
        this.debug('subscribe')
        const node = await this.node.getNode()
        node.addMessageListener(this.onMessageInput)
        node.subscribe(this.streamPartId)
        return node
    }

    private async unsubscribe(node: NetworkNodeStub) {
        this.debug('unsubscribe')
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
        this.debug('stop')
        this.isStopped = true
        this.pipeline.end()
        await this.retire()
        await this.pipeline.return()
    }

    has(sub: Subscription<T>): boolean {
        return this.subscriptions.has(sub)
    }

    async waitForNeighbours(numNeighbours = 1, timeout = 10000): Promise<boolean> {
        return until(async () => {
            if (!this.shouldBeSubscribed()) { return true } // abort
            const node = await this.node.getNode()
            if (!this.shouldBeSubscribed()) { return true } // abort
            return node.getNeighborsForStreamPart(this.streamPartId).length >= numNeighbours
        }, timeout)
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Subscription<T>): Promise<void> {
        if (!sub || this.subscriptions.has(sub) || this.pendingRemoval.has(sub)) { return } // already has
        this.debug('add', sub.id)
        this.subscriptions.add(sub)

        sub.onBeforeFinally.listen(() => {
            return this.remove(sub)
        })

        await this.updateSubscriptions()
    }

    /**
     * Remove subscription & appropriate connection handle.
     */

    async remove(sub: Subscription<T>): Promise<void> {
        if (!sub || this.pendingRemoval.has(sub) || !this.subscriptions.has(sub)) {
            return
        }

        this.debug('remove >>', sub.id)

        this.pendingRemoval.add(sub)
        this.subscriptions.delete(sub)

        try {
            if (!sub.isDone()) {
                await sub.unsubscribe()
            }
        } finally {
            await this.updateSubscriptions()
            this.debug('remove <<', sub.id)
        }
    }

    /**
     * Remove all subscriptions & subscription connection handles
     */

    async removeAll(): Promise<void> {
        this.debug('removeAll %d', this.count())
        await Promise.all([...this.subscriptions].map((sub) => (
            this.remove(sub)
        )))
    }

    /**
     * How many subscriptions
     */
    count(): number {
        return this.subscriptions.size
    }
}
