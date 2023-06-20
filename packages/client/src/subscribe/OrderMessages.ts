/**
 * Makes OrderingUtil more compatible with use in pipeline.
 */
import { MessageRef, StreamID, StreamMessage, StreamPartID } from '@streamr/protocol'
import { EthereumAddress, Logger } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../Config'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushBuffer } from '../utils/PushBuffer'
import { PushPipeline } from '../utils/PushPipeline'
import { Resends } from './Resends'
import { MsgChainContext } from './ordering/OrderedMsgChain'
import OrderingUtil from './ordering/OrderingUtil'

/**
 * Wraps OrderingUtil into a PushBuffer.
 * Implements gap filling
 */
export class OrderMessages {

    private abortController: AbortController = new AbortController()
    private inputClosed = false
    private enabled = true
    private readonly outBuffer = new PushBuffer<StreamMessage>()
    private readonly orderingUtil: OrderingUtil
    private readonly resends: Resends
    private readonly streamPartId: StreamPartID
    private readonly logger: Logger
    private readonly getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>

    constructor(
        config: Pick<StrictStreamrClientConfig, 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>,
        resends: Resends,
        streamPartId: StreamPartID,
        loggerFactory: LoggerFactory,
        getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>
    ) {
        this.resends = resends
        this.streamPartId = streamPartId
        this.logger = loggerFactory.createLogger(module)
        this.getStorageNodes = getStorageNodes
        this.onOrdered = this.onOrdered.bind(this)
        this.onGap = this.onGap.bind(this)
        this.maybeClose = this.maybeClose.bind(this)
        const { gapFillTimeout, retryResendAfter, maxGapRequests, gapFill } = config
        this.enabled = gapFill && (maxGapRequests > 0)
        this.orderingUtil = new OrderingUtil(
            this.streamPartId,
            this.onOrdered,
            this.onGap,
            () => this.maybeClose(),
            () => this.maybeClose(), // probably noop, TODO: handle gapfill errors without closing stream or logging
            gapFillTimeout,
            retryResendAfter,
            this.enabled ? maxGapRequests : 0
        )
    }

    async onGap(from: MessageRef, to: MessageRef, context: MsgChainContext): Promise<void> {
        if (this.isDone() || !this.enabled) { return }
        this.logger.debug('Encountered gap', {
            streamPartId: this.streamPartId,
            context,
            from,
            to,
        })

        let resendMessageStream!: PushPipeline<StreamMessage, StreamMessage>

        try {
            resendMessageStream = await this.resends.resend(this.streamPartId, {
                from,
                to,
                publisherId: context.publisherId,
                msgChainId: context.msgChainId,
                raw: true
            }, this.getStorageNodes, this.abortController.signal)
            if (this.isDone()) { return }

            for await (const streamMessage of resendMessageStream) {
                if (this.isDone()) { return }
                this.orderingUtil.add(streamMessage)
            }
        } catch (err) {
            if (this.isDone()) { return }

            if (err.code === 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                // if stream has no storage we can't do resends
                this.enabled = false
                this.orderingUtil.disable()
            } else {
                this.outBuffer.endWrite(err)
            }
        }
    }

    onOrdered(orderedMessage: StreamMessage): void {
        if (this.outBuffer.isDone() || this.isDone()) {
            return
        }

        this.outBuffer.push(orderedMessage)
    }

    stop(): void {
        this.outBuffer.endWrite()
        this.abortController.abort()
    }

    private isDone() {
        return this.abortController.signal.aborted
    }

    private maybeClose(): void {
        // we can close when:
        // input has closed (i.e. all messages sent)
        // AND
        // no gaps are pending
        // AND
        // gaps have been filled or failed
        // NOTE ordering util cannot have gaps if queue is empty
        if (this.inputClosed && this.orderingUtil.isEmpty()) {
            this.outBuffer.endWrite()
        }
    }

    private async addToOrderingUtil(src: AsyncGenerator<StreamMessage>): Promise<void> {
        try {
            for await (const msg of src) {
                if (!this.isDone()) {
                    this.orderingUtil.add(msg)
                }
            }
            this.inputClosed = true
            this.maybeClose()
        } catch (err) {
            this.outBuffer.endWrite(err)
        }
    }

    transform(): (src: AsyncGenerator<StreamMessage, any, unknown>) => AsyncGenerator<StreamMessage> {
        return async function* Transform(this: OrderMessages, src: AsyncGenerator<StreamMessage>) {
            try {
                this.addToOrderingUtil(src)
                yield* this.outBuffer
            } finally {
                this.stop()
                this.orderingUtil.clearGaps()
                // TODO why there are two clearGaps() calls?
                this.orderingUtil.clearGaps()
            }
        }.bind(this)
    }
}
