/**
 * Public Resend + Subscribe APIs
 */

import type { DependencyContainer } from 'tsyringe'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'
import { instanceId } from './utils'
import type { Context } from './utils/Context'
import type SubscriptionSession from './SubscriptionSession'
import type { SubscriptionOnMessage } from './Subscription'
import Subscription from './Subscription'
import type { SIDLike, StreamMessage } from 'streamr-client-protocol'
import { SPID } from 'streamr-client-protocol'
import type { SubscribeOptions } from './Subscriber'
import type Subscriber from './Subscriber'
import { BrubeckContainer } from './Container'
import { Config } from './Config'
import OrderMessages from './OrderMessages'
import type { ResendOptions, ResendOptionsStrict } from './Resends'
import Resends, { isResendOptions } from './Resends'
import Signal from './utils/Signal'

export class ResendSubscription<T> extends Subscription<T> {
    onResent = Signal.once()
    private orderMessages
    constructor(
        subSession: SubscriptionSession<T>,
        @inject(delay(() => Resends)) private resends: Resends,
        private resendOptions: ResendOptionsStrict,
        container: DependencyContainer
    ) {
        super(subSession)
        this.resendThenRealtime = this.resendThenRealtime.bind(this)
        this.orderMessages = new OrderMessages<T>(
            container.resolve(Config.Subscribe),
            this,
            container.resolve(Resends),
            subSession.spid,
        )
        this.pipe(this.resendThenRealtime)
        this.pipe(this.orderMessages.transform())
        this.onBeforeFinally(async () => {
            this.orderMessages.stop()
        })
    }

    async getResent() {
        const resentMsgs = await this.resends.resend<T>({
            ...this.spid.toObject(),
            resend: this.resendOptions,
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
        } catch (err) {
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
        @inject(BrubeckContainer) private container: DependencyContainer
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    subscribe<T>(options: SubscribeOptions, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T>>
    subscribe<T>(options: ResendOptions, onMessage?: SubscriptionOnMessage<T>): Promise<ResendSubscription<T>>
    subscribe<T>(options: SubscribeOptions | ResendOptions, onMessage?: SubscriptionOnMessage<T>): Promise<Subscription<T> | ResendSubscription<T>> {
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
        const spidOptions = ('stream' in options && options.stream ? options.stream : options) as SIDLike
        const spid = SPID.fromDefaults(spidOptions, { streamPartition: 0 })
        const subSession = this.subscriber.getOrCreateSubscriptionSession<T>(spid)
        const sub = new ResendSubscription<T>(subSession, this.resends, resendOptions, this.container)
        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        await this.subscriber.addSubscription<T>(sub)
        return sub
    }
}
