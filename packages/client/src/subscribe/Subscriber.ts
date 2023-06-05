import { StreamPartID } from '@streamr/protocol'
import { Logger } from '@streamr/utils'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { StreamStorageRegistry } from '../registry/StreamStorageRegistry'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Resends } from './Resends'
import { Subscription } from './Subscription'
import { SubscriptionSession } from './SubscriptionSession'

@scoped(Lifecycle.ContainerScoped)
export class Subscriber {

    private readonly subSessions: Map<StreamPartID, SubscriptionSession> = new Map()
    private readonly resends: Resends
    private readonly groupKeyManager: GroupKeyManager
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly node: NetworkNodeFacade
    private readonly destroySignal: DestroySignal
    private readonly config: StrictStreamrClientConfig
    private readonly loggerFactory: LoggerFactory
    private readonly logger: Logger

    constructor(
        resends: Resends,
        groupKeyManager: GroupKeyManager,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        streamStorageRegistry: StreamStorageRegistry,
        node: NetworkNodeFacade,
        destroySignal: DestroySignal,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
    ) {
        this.resends = resends
        this.groupKeyManager = groupKeyManager
        this.streamRegistryCached = streamRegistryCached
        this.streamStorageRegistry = streamStorageRegistry
        this.node = node
        this.destroySignal = destroySignal
        this.config = config
        this.loggerFactory = loggerFactory
        this.logger = loggerFactory.createLogger(module)
    }

    getOrCreateSubscriptionSession(streamPartId: StreamPartID): SubscriptionSession {
        if (this.subSessions.has(streamPartId)) {
            return this.getSubscriptionSession(streamPartId)!
        }
        const subSession = new SubscriptionSession(
            streamPartId,
            this.resends,
            this.groupKeyManager,
            this.streamRegistryCached,
            this.streamStorageRegistry,
            this.node,
            this.destroySignal,
            this.loggerFactory,
            this.config
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

    async remove(sub: Subscription): Promise<void> {
        const subSession = this.subSessions.get(sub.streamPartId)
        if (!subSession) {
            return
        }
        await subSession.remove(sub)
    }

    getSubscriptions(): Subscription[] {
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
}
