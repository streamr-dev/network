import { DependencyContainer, inject } from 'tsyringe'

import { MessageContent, StreamMessage, SPID } from 'streamr-client-protocol'
import { NetworkNode } from 'streamr-network'

import { Scaffold, instanceId } from './utils'
import { Stoppable } from './utils/Stoppable'
import { Context } from './utils/Context'
import { flow } from './utils/PushBuffer'

import Subscription from './Subscription'
import SubscribePipeline from './SubscribePipeline'
import { BrubeckContainer } from './Container'
import BrubeckNode from './BrubeckNode'

/**
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

export default class SubscriptionSession<T extends MessageContent | unknown> implements Context, Stoppable {
    id
    debug
    spid: SPID
    /** active subs */
    subscriptions: Set<Subscription<T>> = new Set()
    pendingRemoval: Set<Subscription<T>> = new Set()
    active = false
    isStopped = false
    pipeline
    node

    constructor(context: Context, spid: SPID, @inject(BrubeckContainer) container: DependencyContainer) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.spid = spid
        this.distributeMessage = this.distributeMessage.bind(this)
        this.node = container.resolve<BrubeckNode>(BrubeckNode)
        this.onError = this.onError.bind(this)
        this.pipeline = SubscribePipeline<T>(this.spid, {
            onError: this.onError,
        }, this, container)
            .pipe(this.distributeMessage)
            .onFinally(() => (
                this.removeAll()
            ))

        // this.debug('create')
        setImmediate(() => {
            // eslint-disable-next-line promise/catch-or-return
            flow(this.pipeline).catch((err) => {
                this.debug('flow error', err)
            }).finally(() => {
                this.debug('end')
            })
        })
    }

    private onError(error: Error) {
        this.debug('subsession error', error)
        this.subscriptions.forEach(async (sub) => {
            try {
                await sub.onError.trigger(error)
            } catch (err) {
                await sub.push(err)
            }
        })
    }

    async* distributeMessage(src: AsyncGenerator<StreamMessage<T>>) {
        try {
            for await (const msg of src) {
                this.subscriptions.forEach((sub) => (
                    sub.push(msg)
                ))
                yield msg
            }
        } catch (err) {
            this.subscriptions.forEach((sub) => (
                sub.push(err)
            ))
        }
    }

    private onMessageInput = async (msg: StreamMessage) => {
        if (!msg || this.isStopped || !this.active) {
            return
        }

        if (!msg.spid.equals(this.spid)) {
            return
        }

        this.pipeline.push(msg as StreamMessage<T>)
    }

    private async subscribe() {
        this.debug('subscribe')
        this.active = true
        const node = await this.node.getNode()
        node.addMessageListener(this.onMessageInput)
        const { streamId, streamPartition } = this.spid
        node.subscribe(streamId, streamPartition)
        return node
    }

    private async unsubscribe(node: NetworkNode) {
        this.debug('unsubscribe')
        this.active = false
        node.removeMessageListener(this.onMessageInput)
        const { streamId, streamPartition } = this.spid
        node.subscribe(streamId, streamPartition)
    }

    updateSubscriptions = Scaffold([
        async () => {
            let node: NetworkNode | undefined = await this.subscribe()
            return async () => {
                const prevNode = node
                node = undefined
                await this.unsubscribe(prevNode!)
            }
        }
    ], () => !this.isStopped && !!this.count())

    async stop() {
        this.debug('stop')
        this.isStopped = true
        this.pipeline.return()
        await this.removeAll()
    }

    has(sub: Subscription<T>): boolean {
        return this.subscriptions.has(sub)
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Subscription<T>): Promise<void> {
        if (!sub || this.subscriptions.has(sub) || this.pendingRemoval.has(sub)) { return } // already has
        this.subscriptions.add(sub)
        await this.updateSubscriptions()
    }

    /**
     * Remove subscription & appropriate connection handle.
     */

    async remove(sub: Subscription<T>): Promise<void> {
        this.debug('remove')
        if (!sub || this.pendingRemoval.has(sub) || !this.subscriptions.has(sub)) {
            return
        }

        this.pendingRemoval.add(sub)
        this.subscriptions.delete(sub)

        try {
            if (!sub.isUnsubscribed && !sub.isDone()) {
                await sub.unsubscribe()
            }
        } finally {
            try {
                await this.updateSubscriptions()
            } finally {
                this.pendingRemoval.delete(sub)
            }
        }
    }

    /**
     * Remove all subscriptions & subscription connection handles
     */

    async removeAll(): Promise<void> {
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
