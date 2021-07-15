import { allSettledValues, instanceId } from '../utils'
import { Context } from '../utils/Context'
import SubscriptionSession from './SubscriptionSession'
import { BrubeckClient } from './BrubeckClient'
import Subscription, { SubscriptionOnMessage } from './Subscription'
import { SPIDLike, SPID, StreamMatcher, SPIDLikePartial } from 'streamr-client-protocol'

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

    async subscribe<T>(opts: SPIDLikePartial | { stream: SPIDLikePartial }, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T>> {
        if (opts && typeof opts === 'object' && 'stream' in opts) {
            return this.subscribe(opts.stream, onMessage)
        }

        const spid = SPID.fromDefaults(opts, { partition: 0 })
        return this.subscribeTo(spid, onMessage)
    }

    async subscribeTo<T>(spid: SPID, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T>> {
        const sub: Subscription<T> = await this.add(spid)
        if (onMessage) {
            sub.onMessage(onMessage)
        }

        return sub
    }

    async add<T>(spid: SPID): Promise<Subscription<T>> {
        const { key } = spid

        // get/create subscription session
        // don't add SubscriptionSession to subSessions until after subscription successfully created
        const subSession = this.subSessions.get(key) as SubscriptionSession<T> || new SubscriptionSession<T>(this.client, spid)

        // create subscription
        const sub = new Subscription<T>(subSession).onFinally(() => {
            return this.remove(sub)
        })

        // sub didn't throw, add subsession
        this.subSessions.set(key, subSession as SubscriptionSession<unknown>)

        // add subscription to subSession
        try {
            await subSession.add(sub)
        } catch (err) {
            this.debug('failed to add', sub.id, err)
            // clean up if fail
            await this.remove(sub)
            throw err
        }

        return sub
    }

    async remove(sub: Subscription<any>): Promise<void> {
        if (!sub) { return }
        const { key } = sub.spid
        const subSession = this.subSessions.get(key)
        if (subSession) {
            await subSession.remove(sub)
            const count = subSession.count()
            // remove subSession if no more subscriptions
            if (!count) {
                this.subSessions.delete(key)
            }
        }
    }

    async unsubscribe(streamMatcher?: StreamMatcher) {
        return this.removeAll(streamMatcher)
    }

    /**
     * Remove all subscriptions, optionally only those matching options.
     */
    async removeAll(streamMatcher?: StreamMatcher) {
        const subs = !streamMatcher ? this.getAllSubscriptions() : this.getSubscriptions(streamMatcher)
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

    count(streamMatcher?: StreamMatcher): number {
        if (streamMatcher === undefined) { return this.countAll() }
        return this.getSubscriptions(streamMatcher).length
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

    getSubscriptionSession<T = unknown>(spidLike: SPIDLike): SubscriptionSession<T> | undefined {
        const { key } = SPID.from(spidLike)
        const subSession = this.subSessions.get(key)
        if (!subSession) {
            return undefined
        }

        return subSession as SubscriptionSession<T>
    }

    countSubscriptionSessions() {
        return this.subSessions.size
    }

    /**
     * Get subscriptions matching streamId or streamId + streamPartition
     */

    getSubscriptions<T = unknown>(streamMatcher?: StreamMatcher) {
        if (!streamMatcher) {
            return this.getAllSubscriptions()
        }

        return [...this.subSessions.values()].filter((subSession) => {
            return subSession.spid.matches(streamMatcher)
        }).flatMap((subSession) => ([
            ...subSession.subscriptions
        ])) as Subscription<T>[]
    }

    stop() {
        return this.removeAll()
    }
}

