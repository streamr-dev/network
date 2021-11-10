import { DependencyContainer, inject } from 'tsyringe'

import { StreamMessage, SPID } from 'streamr-client-protocol'
import { NetworkNode } from 'streamr-network'

import { Scaffold, instanceId, until } from './utils'
import { Stoppable } from './utils/Stoppable'
import { Context } from './utils/Context'
import Signal from './utils/Signal'
import MessageStream from './MessageStream'

import Subscription from './Subscription'
import SubscribePipeline from './SubscribePipeline'
import { BrubeckContainer } from './Container'
import BrubeckNode from './BrubeckNode'

/**
 * Manages adding & removing subscriptions to node as needed.
 * A session contains one or more subscriptions to a single streamId + streamPartition pair.
 */

export default class SubscriptionSession<T> implements Context, Stoppable {
    id
    debug
    spid: SPID
    /** active subs */
    subscriptions: Set<Subscription<T>> = new Set()
    pendingRemoval: WeakSet<Subscription<T>> = new WeakSet()
    isRetired: boolean = false
    isStopped = false
    pipeline
    node
    onRetired = Signal.once()

    constructor(context: Context, spid: SPID, @inject(BrubeckContainer) container: DependencyContainer) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.spid = spid
        this.distributeMessage = this.distributeMessage.bind(this)
        this.node = container.resolve<BrubeckNode>(BrubeckNode)
        this.onError = this.onError.bind(this)
        this.pipeline = SubscribePipeline<T>(new MessageStream<T>(this), this.spid, this, container)
            .onError(this.onError)
            .pipe(this.distributeMessage)
            .onBeforeFinally(async () => {
                if (!this.isStopped) {
                    await this.stop()
                }
            })
        this.pipeline.flow()
    }

    private async retire() {
        if (this.isRetired) {
            return
        }

        this.isRetired = true
        await this.onRetired.trigger()
    }

    private async onError(error: Error) {
        await Promise.allSettled([...this.subscriptions].map(async (sub) => {
            await sub.handleError(error)
        }))
    }

    async* distributeMessage(src: AsyncGenerator<StreamMessage<T>>) {
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

        if (!msg.spid.equals(this.spid)) {
            return
        }

        await this.pipeline.push(msg as StreamMessage<T>)
    }

    private async subscribe() {
        this.debug('subscribe')
        const node = await this.node.getNode()
        node.addMessageListener(this.onMessageInput)
        const { streamId, streamPartition } = this.spid
        node.subscribe(streamId, streamPartition)
        return node
    }

    private async unsubscribe(node: NetworkNode) {
        this.debug('unsubscribe')
        this.pipeline.end()
        this.pipeline.return()
        this.pipeline.onError.end(new Error('done'))
        node.removeMessageListener(this.onMessageInput)
        const { streamId, streamPartition } = this.spid
        node.unsubscribe(streamId, streamPartition)
    }

    updateNodeSubscriptions = (() => {
        let node: NetworkNode | undefined
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

    async updateSubscriptions() {
        await this.updateNodeSubscriptions()
        if (!this.shouldBeSubscribed() && !this.isStopped) {
            await this.stop()
        }
    }

    shouldBeSubscribed() {
        return !this.isRetired && !this.isStopped && !!this.count()
    }

    async stop() {
        this.debug('stop')
        this.isStopped = true
        this.pipeline.end()
        await this.retire()
        await this.pipeline.return()
    }

    has(sub: Subscription<T>): boolean {
        return this.subscriptions.has(sub)
    }

    async waitForNeighbours(numNeighbours = 1, timeout = 10000) {
        const { streamId, streamPartition } = this.spid

        return until(async () => {
            if (!this.shouldBeSubscribed()) { return true } // abort
            const node = await this.node.getNode()
            if (!this.shouldBeSubscribed()) { return true } // abort
            return node.getNeighborsForStream(streamId, streamPartition).length >= numNeighbours
        }, timeout)
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Subscription<T>): Promise<void> {
        if (!sub || this.subscriptions.has(sub) || this.pendingRemoval.has(sub)) { return } // already has
        this.debug('add', sub.id)
        this.subscriptions.add(sub)

        sub.onBeforeFinally(() => {
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
            if (!sub.isUnsubscribed && !sub.isDone()) {
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
