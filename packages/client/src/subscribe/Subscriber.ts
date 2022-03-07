import { DependencyContainer, inject, scoped, Lifecycle } from 'tsyringe'
import { allSettledValues, instanceId } from '../utils'
import { Context } from '../utils/Context'
import SubscriptionSession from './SubscriptionSession'
import { Subscription, SubscriptionOnMessage } from './Subscription'
import { StreamID, StreamPartID } from 'streamr-client-protocol'
import { BrubeckContainer } from '../Container'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamEndpointsCached } from '../StreamEndpointsCached'
import { StreamDefinition } from '../types'
import { MessageStream, pullManyToOne } from './MessageStream'
import { range } from 'lodash'

/**
 * Public Subscribe APIs
 */

@scoped(Lifecycle.ContainerScoped)
export default class Subscriber implements Context {
    readonly id
    readonly debug
    readonly subSessions: Map<StreamPartID, SubscriptionSession<unknown>> = new Map()

    constructor(
        context: Context,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(BrubeckContainer) private container: DependencyContainer,
        private streamEndpoints: StreamEndpointsCached,
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

    /**
     * Subscribe to all partitions for stream.
     */
    async subscribeAll<T>(streamId: StreamID, onMessage?: SubscriptionOnMessage<T>): Promise<MessageStream<T>> {
        const { partitions } = await this.streamEndpoints.getStream(streamId)
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

    /**
     * @category Important
     */
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
    * @internal
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
     * @internal
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
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    /**
     * Get subscription session for matching sub options.
     * @internal
     */
    getSubscriptionSession<T = unknown>(streamPartId: StreamPartID): SubscriptionSession<T> | undefined {
        const subSession = this.subSessions.get(streamPartId)
        if (!subSession) {
            return undefined
        }

        return subSession as SubscriptionSession<T>
    }

    /** @internal */
    countSubscriptionSessions() {
        return this.subSessions.size
    }

    /**
     * Get subscriptions matching streamId or streamId + streamPartition
     * @category Important
     */
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
            ...subSession.subscriptions
        ]))
    }

    /** @internal */
    async stop() {
        await this.removeAll()
    }
}
