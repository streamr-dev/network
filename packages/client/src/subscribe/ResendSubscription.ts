import { inject } from 'tsyringe'
import { Subscription } from './Subscription'
import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { ConfigInjectionToken } from '../Config'
import { OrderMessages } from './OrderMessages'
import { ResendOptions, Resends } from './Resends'
import { LoggerFactory } from '../utils/LoggerFactory'
import { StrictStreamrClientConfig } from './../Config'
import { MessageStream } from './MessageStream'

export class ResendSubscription extends Subscription {

    private resendOptions: ResendOptions
    private resends: Resends
    private orderMessages: OrderMessages

    /** @internal */
    constructor(
        streamPartId: StreamPartID,
        resendOptions: ResendOptions,
        resends: Resends,
        loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig
    ) {
        super(streamPartId, false, loggerFactory)
        this.resendOptions = resendOptions
        this.resends = resends
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
                this.logger.warn('Skip resend (no storage assigned to stream)', {
                    streamPartId: this.streamPartId,
                    resendOptions: this.resendOptions
                })
            } else {
                await this.handleError(err)
            }
        }

        this.eventEmitter.emit('resendComplete')
        yield* src
    }
}
