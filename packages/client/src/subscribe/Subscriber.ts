import { StreamPartID } from '@streamr/protocol'
import { Logger } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamStorageRegistry } from '../registry/StreamStorageRegistry'
import { StreamDefinition } from '../types'
import { LoggerFactory } from '../utils/LoggerFactory'
import { allSettledValues } from '../utils/promises'
import { MessagePipelineFactory } from './MessagePipelineFactory'
import { Subscription } from './Subscription'
import { SubscriptionSession } from './SubscriptionSession'

@scoped(Lifecycle.ContainerScoped)
export class Subscriber {

    private readonly subSessions: Map<StreamPartID, SubscriptionSession> = new Map()
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly messagePipelineFactory: MessagePipelineFactory
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly node: NetworkNodeFacade
    private readonly logger: Logger

    constructor(
        streamIdBuilder: StreamIDBuilder,
        streamStorageRegistry: StreamStorageRegistry,
        messagePipelineFactory: MessagePipelineFactory,
        node: NetworkNodeFacade,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.messagePipelineFactory = messagePipelineFactory
        this.streamStorageRegistry = streamStorageRegistry
        this.node = node
        this.logger = loggerFactory.createLogger(module)
    }

    getOrCreateSubscriptionSession(streamPartId: StreamPartID): SubscriptionSession {
        if (this.subSessions.has(streamPartId)) {
            return this.getSubscriptionSession(streamPartId)!
        }
        const subSession = new SubscriptionSession(
            streamPartId,
            this.messagePipelineFactory,
            this.streamStorageRegistry,
            this.node
        )

        this.subSessions.set(streamPartId, subSession)
        subSession.onRetired.listen(() => {
            this.subSessions.delete(streamPartId)
        })
        this.logger.debug('Created new SubscriptionSession', { streamPartId })
        return subSession
    }

    async add(sub: Subscription): Promise<void> {
        const subSession = this.getOrCreateSubscriptionSession(sub.streamPartId)

        // add subscription to subSession
        try {
            await subSession.add(sub)
        } catch (err) {
            this.logger.debug('Failed to add Subscription to SubscriptionSession', err)
            // clean up if fail
            await this.remove(sub)
            throw err
        }
    }

    private async remove(sub: Subscription): Promise<void> {
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
    private getAllSubscriptions(): Subscription[] {
        return [...this.subSessions.values()].reduce((o: Subscription[], s: SubscriptionSession) => {
            // @ts-expect-error private
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    /**
     * Get subscription session for matching sub options.
     */
    getSubscriptionSession(streamPartId: StreamPartID): SubscriptionSession | undefined {
        return this.subSessions.get(streamPartId)
    }

    countSubscriptionSessions(): number {
        return this.subSessions.size
    }

    async getSubscriptions(streamDefinition?: StreamDefinition): Promise<Subscription[]> {
        if (!streamDefinition) {
            return this.getAllSubscriptions()
        }

        const results: SubscriptionSession[] = []
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
}
