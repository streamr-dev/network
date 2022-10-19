import { DependencyContainer } from 'tsyringe'
import { SubscriptionSession } from './SubscriptionSession'
import { Subscription } from './Subscription'
import { StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { ConfigInjectionToken } from '../Config'
import { OrderMessages } from './OrderMessages'
import { ResendOptions, Resends } from './Resends'
import { DestroySignal } from '../DestroySignal'
import { LoggerFactory } from '../utils/LoggerFactory'

export class ResendSubscription<T> extends Subscription<T> {
    private orderMessages: OrderMessages<T>

    /** @internal */
    constructor(
        subSession: SubscriptionSession<T>,
        private resends: Resends,
        private resendOptions: ResendOptions,
        container: DependencyContainer
    ) {
        super(subSession, container.resolve(LoggerFactory))
        this.resendThenRealtime = this.resendThenRealtime.bind(this)
        this.orderMessages = new OrderMessages<T>(
            container.resolve(ConfigInjectionToken.Subscribe),
            container.resolve(Resends),
            subSession.streamPartId,
            container.resolve(LoggerFactory)
        )
        this.pipe(this.resendThenRealtime)
        this.pipe(this.orderMessages.transform())
        this.onBeforeFinally.listen(async () => {
            this.orderMessages.stop()
        })
        const destroySignal = container.resolve(DestroySignal)
        destroySignal.onDestroy.listen(() => {
            this.eventEmitter.removeAllListeners()
        })
    }

    private async getResent() {
        const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(this.streamPartId)
        const resentMsgs = await this.resends.resend<T>({
            id,
            partition,
        }, this.resendOptions)

        this.onBeforeFinally.listen(async () => {
            resentMsgs.end()
            await resentMsgs.return()
        })

        return resentMsgs
    }

    /** @internal */
    async* resendThenRealtime(src: AsyncGenerator<StreamMessage<T>>): AsyncGenerator<StreamMessage<T>, void, unknown> {
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
