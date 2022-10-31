import { inject } from 'tsyringe'
import { Subscription } from './Subscription'
import { StreamMessage, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { ConfigInjectionToken } from '../Config'
import { OrderMessages } from './OrderMessages'
import { ResendOptions, Resends } from './Resends'
import { DestroySignal } from '../DestroySignal'
import { LoggerFactory } from '../utils/LoggerFactory'
import { SubscribeConfig } from './../Config'
import { MessageStream } from './MessageStream'

export class ResendSubscription<T> extends Subscription<T> {
    private orderMessages: OrderMessages<T>

    /** @internal */
    constructor(
        streamPartId: StreamPartID,
        private resendOptions: ResendOptions,
        private resends: Resends,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken.Subscribe) subscibreConfig: SubscribeConfig
    ) {
        super(streamPartId, loggerFactory)
        this.resendThenRealtime = this.resendThenRealtime.bind(this)
        this.orderMessages = new OrderMessages<T>(
            subscibreConfig,
            resends,
            streamPartId,
            loggerFactory
        )
        this.pipe(this.resendThenRealtime)
        this.pipe(this.orderMessages.transform())
        this.onBeforeFinally.listen(async () => {
            this.orderMessages.stop()
        })
        destroySignal.onDestroy.listen(() => {
            this.eventEmitter.removeAllListeners()
        })
    }

    private async getResent(): Promise<MessageStream<T>> {
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

    private async* resendThenRealtime(src: AsyncGenerator<StreamMessage<T>>): AsyncGenerator<StreamMessage<T>, void, any> {
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
