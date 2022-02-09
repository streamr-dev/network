/**
 * Public Resend + Subscribe APIs
 */

import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import SubscriptionSession from './SubscriptionSession'
import Subscription, { SubscriptionOnMessage } from './Subscription'
import { StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import Subscriber from './Subscriber'
import { BrubeckContainer } from './Container'
import { Config } from './Config'
import OrderMessages from './OrderMessages'
import Resends, { isResendOptions, ResendOptions, ResendOptionsStrict } from './Resends'
import Signal from './utils/Signal'
import { StreamIDBuilder } from './StreamIDBuilder'
import { StreamDefinition } from './types'

export class ResendSubscription<T> extends Subscription<T> {
    onResent = Signal.once()
    private orderMessages
    constructor(
        subSession: SubscriptionSession<T>,
        private resends: Resends,
        private resendOptions: ResendOptionsStrict,
        container: DependencyContainer
    ) {
        super(subSession)
        this.resendThenRealtime = this.resendThenRealtime.bind(this)
        this.orderMessages = new OrderMessages<T>(
            container.resolve(Config.Subscribe),
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

    async getResent() {
        const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(this.streamPartId)
        const resentMsgs = await this.resends.resend<T>({
            ...this.resendOptions,
            id,
            partition,
        })

        this.onBeforeFinally(async () => {
            resentMsgs.end()
            await resentMsgs.return()
        })

        return resentMsgs
    }

    async* resendThenRealtime(src: AsyncGenerator<StreamMessage<T>>) {
        try {
            yield* await this.getResent()
        } catch (err: any) {
            if (err.code !== 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                await this.handleError(err)
            }
        }

        await this.onResent.trigger()
        yield* src
    }
}

@scoped(Lifecycle.ContainerScoped)
export default class ResendSubscribe implements Context {
    id
    debug

    constructor(
        context: Context,
        private resends: Resends,
        private subscriber: Subscriber,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(BrubeckContainer) private container: DependencyContainer
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    subscribe<T>(options: StreamDefinition, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T>>
    subscribe<T>(options: ResendOptions, onMessage?: SubscriptionOnMessage<T>): Promise<ResendSubscription<T>>
    subscribe<T>(options: StreamDefinition | ResendOptions, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T> | ResendSubscription<T>> {
        if (isResendOptions(options)) {
            return this.resendSubscribe(options, onMessage)
        }

        return this.subscriber.subscribe(options, onMessage)
    }

    async resendSubscribe<T>(
        options: ResendOptions,
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<ResendSubscription<T>> {
        const resendOptions = ('resend' in options && options.resend ? options.resend : options) as ResendOptionsStrict
        const streamPartId = await this.streamIdBuilder.toStreamPartID(options)
        const subSession = this.subscriber.getOrCreateSubscriptionSession<T>(streamPartId)
        const sub = new ResendSubscription<T>(subSession, this.resends, resendOptions, this.container)
        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        await this.subscriber.addSubscription<T>(sub)
        return sub
    }
}
