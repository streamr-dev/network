/**
 * Makes OrderingUtil more compatible with use in pipeline.
 */
import { MessageRef, StreamMessage, StreamPartID } from '@streamr/protocol'
import { Logger } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../Config'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushBuffer } from '../utils/PushBuffer'
import { MessageStream } from './MessageStream'
import { Resends } from './Resends'
import { MsgChainContext } from './ordering/OrderedMsgChain'
import OrderingUtil from './ordering/OrderingUtil'

/**
 * Wraps OrderingUtil into a PushBuffer.
 * Implements gap filling
 */
export class OrderMessages {

    private done = false
    private inputClosed = false
    private enabled = true
    private readonly resendStreams = new Set<MessageStream>() // holds outstanding resends for cleanup
    private readonly outBuffer = new PushBuffer<StreamMessage>()
    private readonly orderingUtil: OrderingUtil
    private readonly config: StrictStreamrClientConfig
    private readonly resends: Resends
    private readonly streamPartId: StreamPartID
    private readonly logger: Logger

    constructor(
        config: StrictStreamrClientConfig,
        resends: Resends,
        streamPartId: StreamPartID,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.resends = resends
        this.streamPartId = streamPartId
        this.logger = loggerFactory.createLogger(module)
        this.onOrdered = this.onOrdered.bind(this)
        this.onGap = this.onGap.bind(this)
        this.maybeClose = this.maybeClose.bind(this)
        const { gapFillTimeout, retryResendAfter, maxGapRequests, gapFill } = this.config
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
        if (this.done || !this.enabled) { return }
        this.logger.debug('Encountered gap', {
            streamPartId: this.streamPartId,
            context,
            from,
            to,
        })

        let resendMessageStream!: MessageStream

        try {
            resendMessageStream = await this.resends.range(this.streamPartId, {
                fromTimestamp: from.timestamp,
                toTimestamp: to.timestamp,
                fromSequenceNumber: from.sequenceNumber,
                toSequenceNumber: to.sequenceNumber,
                publisherId: context.publisherId,
                msgChainId: context.msgChainId,
            }, true)
            resendMessageStream.onFinally.listen(() => {
                this.resendStreams.delete(resendMessageStream)
            })
            this.resendStreams.add(resendMessageStream)
            if (this.done) { return }

            for await (const streamMessage of resendMessageStream.getStreamMessages()) {
                if (this.done) { return }
                this.orderingUtil.add(streamMessage)
            }
        } catch (err) {
            if (this.done) { return }

            if (err.code === 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                // if stream has no storage we can't do resends
                this.enabled = false
                this.orderingUtil.disable()
            } else {
                this.outBuffer.endWrite(err)
            }
        } finally {
            if (resendMessageStream != null) {
                this.resendStreams.delete(resendMessageStream)
            }
        }
    }

    onOrdered(orderedMessage: StreamMessage): void {
        if (this.outBuffer.isDone() || this.done) {
            return
        }

        this.outBuffer.push(orderedMessage)
    }

    stop(): void {
        this.done = true
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
                this.orderingUtil.add(msg)
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
                this.done = true
                this.orderingUtil.clearGaps()
                this.resendStreams.forEach((s) => s.end())
                this.resendStreams.clear()
                this.orderingUtil.clearGaps()
            }
        }.bind(this)
    }
}
