import { DependencyContainer } from 'tsyringe'
import SubscriptionSession from './SubscriptionSession'
import { Subscription } from './Subscription'
import { StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { Config } from '../Config'
import OrderMessages from './OrderMessages'
import Resends, { ResendOptions } from './Resends'
import Signal from '../utils/Signal'

export class ResendSubscription<T> extends Subscription<T> {
    private onResentSignal = Signal.once()

    private orderMessages
    // @internal
    constructor(
        subSession: SubscriptionSession<T>,
        private resends: Resends,
        private resendOptions: ResendOptions,
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

    addOnResentListener(cb: () => void): void {
        this.onResentSignal.listen(cb)
    }

    removeOnResentListener(cb: () => void): void {
        this.onResentSignal.unlisten(cb)
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

    // @internal
    async* resendThenRealtime(src: AsyncGenerator<StreamMessage<T>>) {
        try {
            yield* await this.getResent()
        } catch (err) {
            if (err.code !== 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                await this.handleError(err)
            }
        }

        await this.onResentSignal.trigger()
        yield* src
    }
}
