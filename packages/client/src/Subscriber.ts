/**
 * Public Subscribe APIs
 */

import { DependencyContainer, inject, scoped, Lifecycle } from 'tsyringe'
import { allSettledValues, instanceId } from './utils'
import { Context } from './utils/Context'
import SubscriptionSession from './SubscriptionSession'
import Subscription, { SubscriptionOnMessage } from './Subscription'
import { StreamPartID } from 'streamr-client-protocol'
import { BrubeckContainer } from './Container'
import { definitionToStreamPartID, matches, StreamDefinition } from './StreamDefinition'

export { Subscription, SubscriptionSession }

@scoped(Lifecycle.ContainerScoped)
export default class Subscriber implements Context {
    id
    debug
    readonly subSessions: Map<StreamPartID, SubscriptionSession<unknown>> = new Map()

    constructor(context: Context, @inject(BrubeckContainer) private container: DependencyContainer) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    async subscribe<T>(
        streamDefinition: StreamDefinition,
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<Subscription<T>> {
        return this.subscribeTo(definitionToStreamPartID(streamDefinition), onMessage)
    }

    /** @internal */
    async subscribeTo<T>(streamPartId: StreamPartID, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T>> {
        const sub: Subscription<T> = await this.add(streamPartId)
        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        return sub
    }

    /** @internal */
    getOrCreateSubscriptionSession<T>(streamPartId: StreamPartID) {
        if (this.subSessions.has(streamPartId)) {
            return this.getSubscriptionSession<T>(streamPartId)!
        }
        this.debug('creating new SubscriptionSession: %s', streamPartId)
        const subSession = new SubscriptionSession<T>(this, streamPartId, this.container)
        this.subSessions.set(streamPartId, subSession as SubscriptionSession<unknown>)
        subSession.onRetired(() => {
            this.subSessions.delete(streamPartId)
        })
        return subSession
    }

    /** @internal */
    async addSubscription<T>(sub: Subscription<T>): Promise<Subscription<T>> {
        const subSession = this.getOrCreateSubscriptionSession<T>(sub.streamPartId)

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

    private async add<T>(streamPartId: StreamPartID): Promise<Subscription<T>> {
        const subSession = this.getOrCreateSubscriptionSession<T>(streamPartId)

        // create subscription
        const sub = new Subscription<T>(subSession)
        return this.addSubscription(sub)
    }

    private async remove(sub: Subscription<any>): Promise<void> {
        if (!sub) { return }
        const subSession = this.subSessions.get(sub.streamPartId)
        if (!subSession) {
            return
        }

        await subSession.remove(sub)
    }

    async unsubscribe(streamDefinitionOrSubscription?: StreamDefinition | Subscription): Promise<unknown> {
        if (streamDefinitionOrSubscription instanceof Subscription) {
            return this.remove(streamDefinitionOrSubscription)
        }
        return this.removeAll(streamDefinitionOrSubscription)
    }

    unsubscribeAll = this.removeAll.bind(this)

    /**
     * Remove all subscriptions, optionally only those matching options.
     */
    private async removeAll(streamDefinition?: StreamDefinition): Promise<unknown> {
        const subs = !streamDefinition
            ? this.getAllSubscriptions()
            : this.getSubscriptions(streamDefinition)
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

    count(streamDefinition?: StreamDefinition): number {
        if (streamDefinition === undefined) { return this.countAll() }
        return this.getSubscriptions(streamDefinition).length
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

    /** @internal */
    getSubscriptionSession<T = unknown>(streamPartId: StreamPartID): SubscriptionSession<T> | undefined {
        const subSession = this.subSessions.get(streamPartId)
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

    getSubscriptions<T = unknown>(streamDefinition?: StreamDefinition) {
        if (!streamDefinition) {
            return this.getAllSubscriptions()
        }

        return [...this.subSessions.values()].filter((subSession) => {
            return matches(streamDefinition, subSession.streamPartId)
        }).flatMap((subSession) => ([
            ...subSession.subscriptions
        ])) as Subscription<T>[]
    }

    async stop() {
        await this.removeAll()
    }
}
