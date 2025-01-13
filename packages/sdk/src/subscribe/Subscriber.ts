import { EthereumAddress, Logger, StreamPartID } from '@streamr/utils'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { LoggerFactory } from '../utils/LoggerFactory'
import { MessagePipelineFactory } from './MessagePipelineFactory'
import { Subscription } from './Subscription'
import { SubscriptionSession } from './SubscriptionSession'

@scoped(Lifecycle.ContainerScoped)
export class Subscriber {
    private readonly subSessions: Map<StreamPartID, SubscriptionSession> = new Map()
    private readonly node: NetworkNodeFacade
    private readonly messagePipelineFactory: MessagePipelineFactory
    private readonly logger: Logger

    constructor(
        node: NetworkNodeFacade,
        @inject(delay(() => MessagePipelineFactory)) messagePipelineFactory: MessagePipelineFactory,
        loggerFactory: LoggerFactory
    ) {
        this.node = node
        this.messagePipelineFactory = messagePipelineFactory
        this.logger = loggerFactory.createLogger(module)
    }

    getOrCreateSubscriptionSession(streamPartId: StreamPartID): SubscriptionSession {
        if (this.subSessions.has(streamPartId)) {
            return this.getSubscriptionSession(streamPartId)!
        }
        const subSession = new SubscriptionSession(streamPartId, this.messagePipelineFactory, this.node)

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

    getERC1271ContractAddress(streamPartId: StreamPartID): EthereumAddress | undefined {
        return this.subSessions.get(streamPartId)?.getERC1271ContractAddress()
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
