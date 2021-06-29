import { allSettledValues, instanceId } from '../utils'
import { validateOptions } from '../stream/utils'
import SubscriptionSession from './SubscriptionSession'
import { StreamPartDefinition } from '..'
import { BrubeckClient } from './BrubeckClient'
import Subscription, { SubscriptionOnMessage } from './Subscription'
import { Context } from './Context'

/**
 * Keeps track of subscriptions.
 */

export default class Subscriber implements Context {
    client: BrubeckClient
    id
    debug
    readonly subSessions: Map<string, SubscriptionSession<unknown>> = new Map()

    constructor(client: BrubeckClient) {
        this.client = client
        this.id = instanceId(this)
        this.debug = this.client.debug.extend(this.id)
    }

    async subscribe<T>(opts: StreamPartDefinition, onMessage?: SubscriptionOnMessage<T>) {
        const sub: Subscription<T> = await this.add(opts)
        if (onMessage) {
            sub.onMessage(onMessage)
        }

        return sub
    }

    async add<T>(opts: StreamPartDefinition): Promise<Subscription<T>> {
        const options = validateOptions(opts)
        const { key } = options

        // get/create subscription session
        // don't add SubscriptionSession to subSessions until after subscription successfully created
        const subSession = this.subSessions.get(key) as SubscriptionSession<T> || new SubscriptionSession<T>(this.client, options)

        // create subscription
        const sub = new Subscription<T>(subSession)
        sub.once('end', () => {
            this.remove(sub)
        })

        // sub didn't throw, add subsession
        this.subSessions.set(key, subSession as SubscriptionSession<unknown>)

        // add subscription to subSession
        try {
            await subSession.add(sub)
        } catch (err) {
            // clean up if fail
            await this.remove(sub)
            throw err
        }

        return sub
    }

    async remove(sub: Subscription<any>): Promise<void> {
        const { key } = sub
        let cancelTask
        try {
            cancelTask = sub.cancel()
            const subSession = this.subSessions.get(key)

            if (subSession) {
                await subSession.remove(sub)
                // remove subSession if no more subscriptions
                if (!subSession.count()) {
                    this.subSessions.delete(key)
                }
            }
        } finally {
            await cancelTask // only wait for cancel at end
        }
    }

    async unsubscribe(opts?: StreamPartDefinition) {
        return this.removeAll(opts)
    }

    /**
     * Remove all subscriptions, optionally only those matching options.
     */
    async removeAll(options?: StreamPartDefinition) {
        const subs = !options ? this.getAllSubscriptions() : this.getSubscriptions(options)
        return allSettledValues(subs.map((sub) => (
            this.remove(sub)
        )))
    }

    /**
     * Count all subscriptions.
     */

    countAll() {
        let count = 0
        this.subSessions.forEach((s) => {
            count += s.count()
        })
        return count
    }

    /**
     * Count all matching subscriptions.
     */

    count(options?: StreamPartDefinition): number {
        if (options === undefined) { return this.countAll() }
        return this.getSubscriptions(options).length
    }

    /**
     * Get all subscriptions.
     */

    getAllSubscriptions(): Subscription<unknown>[] {
        return [...this.subSessions.values()].reduce((o: Subscription<unknown>[], s: SubscriptionSession<unknown>) => {
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    /**
     * Get subscription session for matching sub options.
     */

    getSubscriptionSession<T>(options: StreamPartDefinition): SubscriptionSession<T> | undefined {
        const { key } = validateOptions(options)
        const subSession = this.subSessions.get(key)
        if (!subSession) {
            return undefined
        }

        return subSession as SubscriptionSession<T>
    }

    /**
     * Get subscriptions matching options.
     */

    getSubscriptions<T = unknown>(options?: StreamPartDefinition) {
        if (!options) {
            return this.getAllSubscriptions()
        }

        const { key } = validateOptions(options)
        const subSession = this.subSessions.get(key) as SubscriptionSession<T>
        if (!subSession) { return [] }

        return [...subSession.subscriptions]
    }

    stop() {
        return this.removeAll()
    }
}

