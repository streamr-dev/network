import { allSettledValues, instanceId } from '../utils'
import { validateOptions } from '../stream/utils'
import SubscriptionSession from './SubscriptionSession'
import { StreamPartDefinition } from '..'
import { BrubeckClient } from './BrubeckClient'
import MessageStream from './MessageStream'
import Subscription from './Subscription'
import { Context } from './Context'

/**
 * Keeps track of subscriptions.
 */

export default class Subscriber implements Context {
    client: BrubeckClient
    id
    debug
    readonly subSessions: Map<string, SubscriptionSession> = new Map()

    constructor(client: BrubeckClient) {
        this.client = client
        this.id = instanceId(this)
        this.debug = this.client.debug.extend(this.id)
    }

    async subscribe(opts: StreamPartDefinition) {
        return this.add(opts)
    }

    async add(opts: StreamPartDefinition) {
        const options = validateOptions(opts)
        const { key } = options

        // get/create subscription session
        // don't add SubscriptionSession to subSessions until after subscription successfully created
        const subSession = this.subSessions.get(key) || new SubscriptionSession(this.client, options)

        // create subscription
        const sub = new Subscription(subSession, options)
        sub.once('end', () => {
            this.remove(sub)
        })

        // sub didn't throw, add subsession
        this.subSessions.set(key, subSession)

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

    async remove(sub: MessageStream): Promise<void> {
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
        const subs = this.get(options)
        return allSettledValues(subs.map((sub: MessageStream) => (
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
        return this.get(options).length
    }

    /**
     * Get all subscriptions.
     */

    getAll(): MessageStream[] {
        return [...this.subSessions.values()].reduce((o: MessageStream[], s: SubscriptionSession) => {
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    /**
     * Get subscription session for matching sub options.
     */

    getSubscriptionSession(options: StreamPartDefinition): SubscriptionSession | undefined {
        const { key } = validateOptions(options)
        return this.subSessions.get(key)
    }

    /**
     * Get all subscriptions matching options.
     */

    get(options?: StreamPartDefinition): MessageStream[] {
        if (options === undefined) { return this.getAll() }

        const { key } = validateOptions(options)
        const subSession = this.subSessions.get(key)
        if (!subSession) { return [] }

        return [...subSession.subscriptions]
    }
}

