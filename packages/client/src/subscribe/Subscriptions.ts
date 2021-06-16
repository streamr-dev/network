import { allSettledValues } from '../utils'
import { validateOptions } from '../stream/utils'
import Subscription from './Subscription'
import SubscriptionSession from './SubscriptionSession'
import { MaybeAsync } from '../types'
import StreamrClient, { StreamPartDefinition } from '..'

async function defaultOnFinally(err?: Error) {
    if (err) {
        throw err
    }
}

/**
 * Keeps track of subscriptions.
 */

export default class Subscriptions {
    client: StreamrClient
    readonly subSessions: Map<string, SubscriptionSession> = new Map()

    constructor(client: StreamrClient) {
        this.client = client
    }

    async add(opts: StreamPartDefinition, onFinally: MaybeAsync<(err?: any) => void> = defaultOnFinally) {
        const options = validateOptions(opts)
        const { key } = options

        // get/create subscription session
        // don't add SubscriptionSession to subSessions until after subscription successfully created
        const subSession = this.subSessions.get(key) || new SubscriptionSession(this.client, options)

        // create subscription
        const sub = new Subscription(this.client, {
            ...options,
            validate: subSession.validate,
        }, async (err?: Error) => {
            try {
                await this.remove(sub)
            } finally {
                await onFinally(err)
            }
        })
        sub.count = () => {
            // sub.count() gives number of subs on same stream+partition
            return this.count(options)
        }

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

    async remove(sub: Subscription): Promise<void> {
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

    /**
     * Remove all subscriptions, optionally only those matching options.
     */
    async removeAll(options?: StreamPartDefinition) {
        const subs = this.get(options)
        return allSettledValues(subs.map((sub: Subscription) => (
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

    getAll(): Subscription[] {
        return [...this.subSessions.values()].reduce((o: Subscription[], s: SubscriptionSession) => {
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

    get(options?: StreamPartDefinition): Subscription[] {
        if (options === undefined) { return this.getAll() }

        const { key } = validateOptions(options)
        const subSession = this.subSessions.get(key)
        if (!subSession) { return [] }

        return [...subSession.subscriptions]
    }
}
