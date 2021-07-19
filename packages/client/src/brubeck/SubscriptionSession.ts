import { MessageContent, StreamMessage, SPID } from 'streamr-client-protocol'

import { Scaffold, instanceId } from '../utils'
import Subscription from './Subscription'
import { BrubeckClient } from './BrubeckClient'
import { Context } from '../utils/Context'
import SubscribePipeline from './SubscribePipeline'
import { flow } from '../utils/PushBuffer'

/**
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

export default class SubscriptionSession<T extends MessageContent | unknown> implements Context {
    id
    debug
    client: BrubeckClient
    spid: SPID
    /** active subs */
    subscriptions: Set<Subscription<T>> = new Set()
    pendingRemoval: Set<Subscription<T>> = new Set()
    active = false
    stopped = false
    pipeline

    constructor(client: BrubeckClient, spid: SPID) {
        this.client = client
        this.id = instanceId(this)
        this.debug = this.client.debug.extend(this.id)
        this.spid = spid
        const { subscriptions } = this
        this.pipeline = SubscribePipeline<T>(this.client, spid)
            .pipe(async function* DistributeMessage(src) {
                for await (const msg of src) {
                    subscriptions.forEach((sub) => {
                        sub.push(msg)
                    })

                    yield msg
                }
            })
            .onFinally(() => (
                this.removeAll()
            ))

        // eslint-disable-next-line promise/catch-or-return
        flow(this.pipeline).catch((err) => {
            this.debug('error', err)
        }).finally(() => {
            this.debug('end')
        })
    }

    private onMessageInput = async (msg: StreamMessage) => {
        if (!msg || this.stopped || !this.active) {
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
        const node = await this.client.getNode()
        node.addMessageListener(this.onMessageInput)
        const { streamId, streamPartition } = this.spid
        node.subscribe(streamId, streamPartition)
    }

    private async unsubscribe() {
        this.debug('unsubscribe')
        this.active = false
        const node = await this.client.getNode()
        node.removeMessageListener(this.onMessageInput)
        const { streamId, streamPartition } = this.spid
        node.subscribe(streamId, streamPartition)
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
