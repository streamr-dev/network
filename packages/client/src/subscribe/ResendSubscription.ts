import { inject } from 'tsyringe'
import { Subscription } from './Subscription'
import { StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { ConfigInjectionToken } from '../Config'
import { OrderMessages } from './OrderMessages'
import { ResendOptions, Resends } from './Resends'
import { LoggerFactory } from '../utils/LoggerFactory'
import { StrictStreamrClientConfig } from './../Config'
import { MessageStream } from './MessageStream'

export class ResendSubscription extends Subscription {
    private orderMessages: OrderMessages

    /** @internal */
    constructor(
        streamPartId: StreamPartID,
        private resendOptions: ResendOptions,
        private resends: Resends,
        loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig
    ) {
        super(streamPartId, loggerFactory)
        this.orderMessages = new OrderMessages(
            config,
            resends,
            streamPartId,
            loggerFactory
        )
        this.pipe(this.resendThenRealtime.bind(this))
        this.pipe(this.orderMessages.transform())
        this.onBeforeFinally.listen(async () => {
            this.orderMessages.stop()
        })
    }

    private async getResent(): Promise<MessageStream> {
        const resentMsgs = await this.resends.resend(this.streamPartId, this.resendOptions)

        this.onBeforeFinally.listen(async () => {
            resentMsgs.end()
            await resentMsgs.return()
        })

        return resentMsgs
    }

    private async* resendThenRealtime(src: AsyncGenerator<StreamMessage>): AsyncGenerator<StreamMessage, void, any> {
        try {
            yield* (await this.getResent()).getStreamMessages()
        } catch (err) {
            if (err.code === 'NO_STORAGE_NODES') {
                const streamId = StreamPartIDUtils.getStreamID(this.streamPartId)
                this.logger.warn(`no storage assigned: ${streamId}`)
            } else {
                await this.handleError(err)
            }
        }

        this.eventEmitter.emit('resendComplete')
        yield* src
    }
}
