import { DependencyContainer, inject, scoped, delay, Lifecycle } from 'tsyringe'
import { instanceId } from '../utils/utils'
import { allSettledValues } from '../utils/promises'
import { Context } from '../utils/Context'
import { SubscriptionSession } from './SubscriptionSession'
import { Subscription, SubscriptionOnMessage } from './Subscription'
import { StreamID, StreamPartID } from 'streamr-client-protocol'
import { BrubeckContainer } from '../Container'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamRegistryCached } from '../StreamRegistryCached'
import { StreamDefinition } from '../types'
import { MessageStream, pullManyToOne } from './MessageStream'
import { range } from 'lodash'

/**
 * Public Subscribe APIs
 */

@scoped(Lifecycle.ContainerScoped)
export class Subscriber implements Context {
    readonly id
    readonly debug
    private readonly subSessions: Map<StreamPartID, SubscriptionSession<unknown>> = new Map()

    constructor(
        context: Context,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(delay(() => StreamRegistryCached)) private streamRegistryCached: StreamRegistryCached,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    async subscribe<T>(
        streamDefinition: StreamDefinition,
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<Subscription<T>> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        return this.subscribeTo(streamPartId, onMessage)
    }

    async subscribeAll<T>(streamId: StreamID, onMessage?: SubscriptionOnMessage<T>): Promise<MessageStream<T>> {
        const { partitions } = await this.streamRegistryCached.getStream(streamId)
        if (partitions === 1) {
            // nothing interesting to do, treat as regular subscription
            return this.subscribe<T>(streamId, onMessage)
        }

        // create sub for each partition
        const subs = await Promise.all(range(partitions).map(async (streamPartition) => {
            return this.subscribe<T>({
                streamId,
                partition: streamPartition,
            })
        }))

        return pullManyToOne(this, subs, onMessage)
    }

    private async subscribeTo<T>(streamPartId: StreamPartID, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T>> {
        const sub: Subscription<T> = await this.add(streamPartId)
        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        return sub
    }

    getOrCreateSubscriptionSession<T>(streamPartId: StreamPartID): SubscriptionSession<T> {
        if (this.subSessions.has(streamPartId)) {
            return this.getSubscriptionSession<T>(streamPartId)!
        }
        this.debug('creating new SubscriptionSession: %s', streamPartId)
        const subSession = new SubscriptionSession<T>(this, streamPartId, this.container)
        this.subSessions.set(streamPartId, subSession as SubscriptionSession<unknown>)
        subSession.onRetired.listen(() => {
            this.subSessions.delete(streamPartId)
        })
        return subSession
    }

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

    /**
     * Remove all subscriptions, optionally only those matching options.
     */
    private async removeAll(streamDefinition?: StreamDefinition): Promise<unknown> {
        const subs = !streamDefinition
            ? this.getAllSubscriptions()
            : await this.getSubscriptions(streamDefinition)
        return allSettledValues(subs.map((sub) => (
            this.remove(sub)
        )))
    }

    /**
     * Count all subscriptions.
     */
    countAll(): number {
        let count = 0
        this.subSessions.forEach((s) => {
            count += s.count()
        })
        return count
    }

    /**
     * Count all matching subscriptions.
     */
    // TODO rename this to something more specific?
    async count(streamDefinition?: StreamDefinition): Promise<number> {
        if (streamDefinition === undefined) { return this.countAll() }
        return (await this.getSubscriptions(streamDefinition)).length
    }

    /**
     * Get all subscriptions.
     */
    private getAllSubscriptions(): Subscription<unknown>[] {
        return [...this.subSessions.values()].reduce((o: Subscription<unknown>[], s: SubscriptionSession<unknown>) => {
            // @ts-expect-error private
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    /**
     * Get subscription session for matching sub options.
     */
    getSubscriptionSession<T = unknown>(streamPartId: StreamPartID): SubscriptionSession<T> | undefined {
        const subSession = this.subSessions.get(streamPartId)
        if (!subSession) {
            return undefined
        }

        return subSession as SubscriptionSession<T>
    }

    countSubscriptionSessions(): number {
        return this.subSessions.size
    }

    async getSubscriptions(streamDefinition?: StreamDefinition): Promise<Subscription<unknown>[]> {
        if (!streamDefinition) {
            return this.getAllSubscriptions()
        }

        const results: SubscriptionSession<unknown>[] = []
        await Promise.all([...this.subSessions.values()].map(async (subSession) => {
            const isMatch = await this.streamIdBuilder.match(streamDefinition, subSession.streamPartId)
            if (isMatch) {
                results.push(subSession)
            }
        }))

        return results.flatMap((subSession) => ([
            // @ts-expect-error private
            ...subSession.subscriptions
        ]))
    }

    async stop(): Promise<void> {
        await this.removeAll()
    }
}
