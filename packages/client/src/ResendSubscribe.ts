/**
 * Public Resend + Subscribe APIs
 */

import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import SubscriptionSession from './SubscriptionSession'
import Subscription, { SubscriptionOnMessage } from './Subscription'
import { SPID, SIDLike } from 'streamr-client-protocol'
import Subscriber, { SubscribeOptions } from './Subscriber'
import { BrubeckContainer } from './Container'
import { Config } from './Config'
import OrderMessages from './OrderMessages'
import Resends, { isResendOptions, ResendOptions, ResendOptionsStrict } from './Resends'
import Signal from './utils/Signal'

export class ResendSubscription<T> extends Subscription<T> {
    onResent = Signal.once()
    constructor(
        subSession: SubscriptionSession<T>,
        resends: Resends,
        options: ResendOptionsStrict,
        container: DependencyContainer
    ) {
        super(subSession)
        const sub = this
        const orderMessages = new OrderMessages<T>(container.resolve(Config.Subscribe), container.resolve(Context as any), container.resolve(Resends))
        this.pipe(async function* ResendThenRealtime(src) {
            const resentMsgs = await resends.resend<T>({
                ...sub.spid.toObject(),
                resend: options,
            })
            sub.onBeforeFinally(async () => {
                orderMessages.stop()
                resentMsgs.end()
                sub.end()
                await resentMsgs.return()
            })
            yield* resentMsgs
            sub.onResent.trigger()
            yield* src
        })
        this.pipe(orderMessages.transform(subSession.spid))
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
