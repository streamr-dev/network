import { DependencyContainer } from 'tsyringe'
import SubscriptionSession from './SubscriptionSession'
import { Subscription } from './Subscription'
import { StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { ConfigInjectionToken } from '../Config'
import OrderMessages from './OrderMessages'
import Resends, { ResendOptions } from './Resends'
import EventEmitter from 'eventemitter3'

export interface ResendSubscriptionEvents {
    resendComplete: () => void
}

export class ResendSubscription<T> extends Subscription<T> {
    private orderMessages
    private eventEmitter: EventEmitter<ResendSubscriptionEvents>
    /** @internal */
    constructor(
        subSession: SubscriptionSession<T>,
        private resends: Resends,
        private resendOptions: ResendOptions,
        container: DependencyContainer
    ) {
        super(subSession)
        this.eventEmitter = new EventEmitter<ResendSubscriptionEvents>()
        this.resendThenRealtime = this.resendThenRealtime.bind(this)
        this.orderMessages = new OrderMessages<T>(
            container.resolve(ConfigInjectionToken.Subscribe),
            this,
            container.resolve(Resends),
            subSession.streamPartId,
        )
        this.pipe(this.resendThenRealtime)
        this.pipe(this.orderMessages.transform())
        this.onBeforeFinally(async () => {
            this.orderMessages.stop()
        })
    }

    private async getResent() {
        const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(this.streamPartId)
        const resentMsgs = await this.resends.resend<T>({
            id,
            partition,
        }, this.resendOptions)

        this.onBeforeFinally(async () => {
            resentMsgs.end()
            await resentMsgs.return()
        })

        return resentMsgs
    }

    once<E extends keyof ResendSubscriptionEvents>(eventName: E, listener: ResendSubscriptionEvents[E]) {
        this.eventEmitter.once(eventName, listener as any)
    }

    off<E extends keyof ResendSubscriptionEvents>(eventName: E, listener: ResendSubscriptionEvents[E]) {
        this.eventEmitter.off(eventName, listener as any)
    }

    /** @internal */
    async* resendThenRealtime(src: AsyncGenerator<StreamMessage<T>>) {
        try {
            yield* await this.getResent()
        } catch (err) {
            if (err.code !== 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                await this.handleError(err)
            }
        }

        this.eventEmitter.emit('resendComplete')
        yield* src
    }
}
