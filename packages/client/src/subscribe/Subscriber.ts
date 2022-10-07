import { inject, scoped, Lifecycle, delay } from 'tsyringe'
import { instanceId } from '../utils/utils'
import { allSettledValues } from '../utils/promises'
import { Context } from '../utils/Context'
import { SubscriptionSession } from './SubscriptionSession'
import { Subscription, SubscriptionOnMessage } from './Subscription'
import { StreamPartID } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { StreamDefinition } from '../types'
import { Resends } from './Resends'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { SubscriberKeyExchange } from '../encryption/SubscriberKeyExchange'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamrClientEventEmitter } from '../events'
import { DestroySignal } from '../DestroySignal'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'

/**
 * Public Subscribe APIs
 */

@scoped(Lifecycle.ContainerScoped)
export class Subscriber implements Context {

    readonly id
    readonly debug
    private readonly subSessions: Map<StreamPartID, SubscriptionSession<unknown>> = new Map()
    private streamIdBuilder: StreamIDBuilder
    private resends: Resends
    private groupKeyStore: GroupKeyStore
    private subscriberKeyExchange: SubscriberKeyExchange
    private streamRegistryCached: StreamRegistryCached
    private node: NetworkNodeFacade
    private streamrClientEventEmitter: StreamrClientEventEmitter
    private destroySignal: DestroySignal
    private rootConfig: StrictStreamrClientConfig

    constructor(
        context: Context,
        streamIdBuilder: StreamIDBuilder,
        resends: Resends,
        groupKeyStore: GroupKeyStore,
        subscriberKeyExchange: SubscriberKeyExchange,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        node: NetworkNodeFacade,
        streamrClientEventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal,
        @inject(ConfigInjectionToken.Root) rootConfig: StrictStreamrClientConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.streamIdBuilder = streamIdBuilder
        this.resends = resends
        this.groupKeyStore = groupKeyStore
        this.subscriberKeyExchange = subscriberKeyExchange
        this.streamRegistryCached = streamRegistryCached
        this.node = node
        this.streamrClientEventEmitter = streamrClientEventEmitter
        this.destroySignal = destroySignal
        this.rootConfig = rootConfig
    }

    async subscribe<T>(
        streamDefinition: StreamDefinition,
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<Subscription<T>> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        return this.subscribeTo(streamPartId, onMessage)
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
        const subSession = new SubscriptionSession<T>(
            this,
            streamPartId,
            this.resends,
            this.groupKeyStore,
            this.subscriberKeyExchange,
            this.streamRegistryCached,
            this.node,
            this.streamrClientEventEmitter,
            this.destroySignal,
            this.rootConfig
        )
        
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
