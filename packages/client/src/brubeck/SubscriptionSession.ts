import { MessageContent, StreamMessage } from 'streamr-client-protocol'

import { Scaffold, instanceId } from '../utils'
import { validateOptions } from '../stream/utils'
import Subscription from './Subscription'
import MessageStream from './MessageStream'
import { BrubeckClient } from './BrubeckClient'
import { PushBuffer } from '../utils/PushBuffer'
import { Context } from '../utils/Context'

export type SubscriptionSessionOptions = ReturnType<typeof validateOptions>

/**
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

export default class SubscriptionSession<T extends MessageContent | unknown> implements Context {
    id
    debug
    client: BrubeckClient
    options: SubscriptionSessionOptions
    streamId
    streamPartition
    /** active subs */
    subscriptions: Set<Subscription<T>> = new Set()
    pendingRemoval: Set<Subscription<T>> = new Set()
    active = false
    stopped = false
    buffer
    pipeline: MessageStream<T>

    constructor(client: BrubeckClient, options: SubscriptionSessionOptions) {
        this.client = client
        this.options = validateOptions(options)
        this.id = instanceId(this)
        this.debug = this.client.debug.extend(this.id)
        this.streamId = this.options.streamId
        this.streamPartition = this.options.streamPartition
        this.onMessage = this.onMessage.bind(this)
        this.buffer = new PushBuffer<StreamMessage<T>>()
        this.pipeline = new MessageStream(this)
        this.pipeline.from(this.buffer)
        this.pipeline.on('error', (error: Error) => this.debug('error', error))
        this.pipeline.once('end', () => {
            this.removeAll()
        })
        this.pipeline.on('message', this.onPipelineMessage)
        // this.debug('create')
    }

    onPipelineMessage = (msg: StreamMessage<T>) => {
        this.subscriptions.forEach((sub) => {
            sub.push(msg)
        })
    }

    private onMessage = (msg: StreamMessage<T>) => {
        if (!msg || this.stopped || !this.active) {
            return
        }

        const streamId = msg.getStreamId()
        const streamPartition = msg.getStreamPartition()
        if (this.options.streamId !== streamId || this.options.streamPartition !== streamPartition) {
            return
        }

        this.buffer.push(msg)
    }

    private async subscribe() {
        this.debug('subscribe')
        this.active = true
        const node = await this.client.getNode()
        node.addMessageListener(this.onMessage)
        node.subscribe(this.streamId, this.streamPartition)
    }

    private async unsubscribe() {
        this.debug('unsubscribe')
        this.active = false
        const node = await this.client.getNode()
        node.removeMessageListener(this.onMessage)
        node.unsubscribe(this.streamId, this.streamPartition)
    }

    updateSubscriptions = Scaffold([
        async () => {
            await this.subscribe()
            return async () => {
                await this.unsubscribe()
            }
        }
    ], () => !!this.count())

    async stop() {
        this.buffer.end()
        this.pipeline.end()
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
            if (!sub.isUnsubscribed && !sub.isDone) {
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
