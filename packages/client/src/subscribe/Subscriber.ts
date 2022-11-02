import { inject, scoped, Lifecycle, delay } from 'tsyringe'
import { allSettledValues } from '../utils/promises'
import { SubscriptionSession } from './SubscriptionSession'
import { Subscription } from './Subscription'
import { StreamPartID } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamDefinition } from '../types'
import { Resends } from './Resends'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { SubscriberKeyExchange } from '../encryption/SubscriberKeyExchange'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamrClientEventEmitter } from '../events'
import { DestroySignal } from '../DestroySignal'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'

/**
 * Public Subscribe APIs
 */

@scoped(Lifecycle.ContainerScoped)
export class Subscriber {
    private readonly subSessions: Map<StreamPartID, SubscriptionSession<unknown>> = new Map()
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly resends: Resends
    private readonly groupKeyStore: GroupKeyStore
    private readonly subscriberKeyExchange: SubscriberKeyExchange
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly node: NetworkNodeFacade
    private readonly streamrClientEventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal
    private readonly rootConfig: StrictStreamrClientConfig
    private readonly loggerFactory: LoggerFactory
    private readonly logger: Logger

    constructor(
        streamIdBuilder: StreamIDBuilder,
        resends: Resends,
        groupKeyStore: GroupKeyStore,
        subscriberKeyExchange: SubscriberKeyExchange,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        node: NetworkNodeFacade,
        streamrClientEventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal,
        @inject(ConfigInjectionToken.Root) rootConfig: StrictStreamrClientConfig,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.resends = resends
        this.groupKeyStore = groupKeyStore
        this.subscriberKeyExchange = subscriberKeyExchange
        this.streamRegistryCached = streamRegistryCached
        this.node = node
        this.streamrClientEventEmitter = streamrClientEventEmitter
        this.destroySignal = destroySignal
        this.rootConfig = rootConfig
        this.loggerFactory = loggerFactory
        this.logger = loggerFactory.createLogger(module)
    }

    getOrCreateSubscriptionSession<T>(streamPartId: StreamPartID): SubscriptionSession<T> {
        if (this.subSessions.has(streamPartId)) {
            return this.getSubscriptionSession<T>(streamPartId)!
        }
        const subSession = new SubscriptionSession<T>(
            streamPartId,
            this.resends,
            this.groupKeyStore,
            this.subscriberKeyExchange,
            this.streamRegistryCached,
            this.node,
            this.streamrClientEventEmitter,
            this.destroySignal,
            this.loggerFactory,
            this.rootConfig
        )

        this.subSessions.set(streamPartId, subSession as SubscriptionSession<unknown>)
        subSession.onRetired.listen(() => {
            this.subSessions.delete(streamPartId)
        })
        this.logger.debug('created new SubscriptionSession for stream part %s', streamPartId)
        return subSession
    }

    async addSubscription<T>(sub: Subscription<T>): Promise<Subscription<T>> {
        const subSession = this.getOrCreateSubscriptionSession<T>(sub.streamPartId)

        // add subscription to subSession
        try {
            await subSession.add(sub)
        } catch (err) {
            this.logger.debug('failed to add Subscription to SubscriptionSession, reason: %s', err)
            // clean up if fail
            await this.remove(sub)
            throw err
        }

        return sub
    }

    async add<T>(streamPartId: StreamPartID): Promise<Subscription<T>> {
        const sub = new Subscription<T>(streamPartId, this.loggerFactory)
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
