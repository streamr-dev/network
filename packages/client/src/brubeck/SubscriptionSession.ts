import Emitter from 'events'

import { StreamMessage } from 'streamr-client-protocol'

import { AggregatedError, Scaffold, counterId } from '../utils'
import { validateOptions } from '../stream/utils'
import Subscription from './Subscription'
import MessageStream from './MessageStream'
import SubscribePipeline from './SubscribePipeline'
import { Todo } from '../types'
import { BrubeckClient } from './BrubeckClient'

/**
 * Emit event on all supplied emitters.
 * Aggregates errors rather than throwing on first.
 */

function multiEmit(emitters: Todo, ...args: Todo[]) {
    let error: Todo
    emitters.forEach((s: Todo) => {
        try {
            s.emit(...args)
        } catch (err) {
            AggregatedError.from(error, err, `Error emitting event: ${args[0]}`)
        }
    })

    if (error) {
        throw error
    }
}

export type SubscriptionSessionOptions = ReturnType<typeof validateOptions> & {
    id?: string
}

/**
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

export default class SubscriptionSession<T> extends Emitter {
    id
    debug
    client: BrubeckClient
    options: SubscriptionSessionOptions
    /** active subs */
    subscriptions: Set<Subscription<T>> = new Set()
    pendingRemoval: Set<Subscription<T>> = new Set()
    active = false
    stopped = false
    buffer
    pipeline

    constructor(client: BrubeckClient, options: SubscriptionSessionOptions) {
        super()
        this.client = client
        this.options = validateOptions(options)
        this.id = counterId(`SubscriptionSession:${this.options.id || ''}${this.options.key}`)
        this.debug = this.client.debug.extend(this.id)
        this.onMessage = this.onMessage.bind(this)
        this.buffer = new MessageStream<T>(this, this.options)
        this.pipeline = new MessageStream<T>(this, this.options)
        this.pipeline.from(SubscribePipeline(this.client.client, this.buffer, this.options))
        this.pipeline.on('error', (error) => this.emit('error', error))
        this.pipeline.on('end', () => this.emit('end'))
        this.pipeline.on('message', this.onPipelineMessage)
        this.debug('create')
    }

    onPipelineMessage = (msg: StreamMessage) => {
        this.subscriptions.forEach((sub) => {
            sub.push(msg as StreamMessage<T>)
        })
    }

    private onMessage = (msg: StreamMessage) => {
        if (!msg || this.stopped || !this.active) {
            return
        }

        const streamId = msg.getStreamId()
        const streamPartition = msg.getStreamPartition()
        if (this.options.streamId !== streamId || this.options.streamPartition !== streamPartition) {
            return
        }
        this.buffer.push(msg as StreamMessage<T>)
    }

    private async subscribe({ streamId, streamPartition }: { streamId: string, streamPartition: number }) {
        this.active = true
        const node = await this.client.getNode()
        node.addMessageListener(this.onMessage)
        node.subscribe(streamId, streamPartition)
    }

    private async unsubscribe({ streamId, streamPartition }: { streamId: string, streamPartition: number }) {
        this.active = false
        const node = await this.client.getNode()
        node.removeMessageListener(this.onMessage)
        node.unsubscribe(streamId, streamPartition)
    }

    updateSubscriptions = Scaffold([
        async () => {
            await this.subscribe(this.options)
            return async () => {
                await this.unsubscribe(this.options)
            }
        }
    ], () => !!this.subscriptions.size)

    has(sub: Subscription<T>): boolean {
        return this.subscriptions.has(sub)
    }

    /**
     * Emit message on every subscription,
     * then on self.
     */

    emit(event: string | symbol, ...args: any[]): boolean {
        const subs = this.subscriptions
        if (event === 'error') {
            this.debug('emit', event, ...args)
        } else {
            this.debug('emit', event)
        }

        try {
            multiEmit(subs, event, ...args)
        } catch (error) {
            return super.emit('error', error)
        }

        return super.emit(event, ...args)
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
        if (!sub || this.pendingRemoval.has(sub) || !this.subscriptions.has(sub)) {
            return
        }

        this.pendingRemoval.add(sub)
        this.subscriptions.delete(sub)
        // sub.emit('unsubscribing')

        try {
            await sub.cancel()
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
