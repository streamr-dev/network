/**
 * Makes OrderingUtil more compatible with use in pipeline.
 */
import { injectable } from 'tsyringe'
import { OrderingUtil, StreamMessage, StreamPartID, MessageRef, EthereumAddress } from 'streamr-client-protocol'

import { PushBuffer } from '../utils/PushBuffer'
import { Context } from '../utils/Context'
import Signal from '../utils/Signal'
import { instanceId } from '../utils'

import Resends from './Resends'
import { MessageStream } from './MessageStream'
import { SubscribeConfig } from '../Config'

/**
 * Wraps OrderingUtil into a PushBuffer.
 * Implements gap filling
 */
@injectable()
export class OrderMessages<T> implements Context {
    readonly id
    readonly debug
    stopSignal = Signal.once()
    done = false
    resendStreams = new Set<MessageStream<T>>() // holds outstanding resends for cleanup
    outBuffer = new PushBuffer<StreamMessage<T>>()
    inputClosed = false
    orderMessages: boolean
    enabled = true
    orderingUtil

    constructor(
        private options: SubscribeConfig,
        context: Context,
        private resends: Resends,
        private readonly streamPartId: StreamPartID,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.stopSignal(() => {
            this.done = true
        })
        this.onOrdered = this.onOrdered.bind(this)
        this.onGap = this.onGap.bind(this)
        this.maybeClose = this.maybeClose.bind(this)
        const { gapFillTimeout, retryResendAfter, maxGapRequests, orderMessages = true, gapFill = true } = this.options
        this.enabled = !!(gapFill && maxGapRequests)
        this.orderMessages = orderMessages
        this.orderingUtil = new OrderingUtil(
            this.onOrdered,
            this.onGap,
            gapFillTimeout,
            retryResendAfter,
            this.enabled ? maxGapRequests : 0
        )

        this.orderingUtil.on('drain', this.maybeClose)

        // TODO: handle gapfill errors without closing stream or logging
        this.orderingUtil.on('error', this.maybeClose) // probably noop
    }

    async onGap(from: MessageRef, to: MessageRef, publisherId: EthereumAddress, msgChainId: string) {
        if (this.done || !this.enabled) { return }
        this.debug('gap %o', {
            streamPartId: this.streamPartId, publisherId, msgChainId, from, to,
        })

        let resendMessageStream!: MessageStream<T>

        try {
            resendMessageStream = await this.resends.range(this.streamPartId, {
                fromTimestamp: from.timestamp,
                toTimestamp: to.timestamp,
                fromSequenceNumber: from.sequenceNumber,
                toSequenceNumber: to.sequenceNumber,
                publisherId,
                msgChainId,
            })
            resendMessageStream.onFinally(() => {
                this.resendStreams.delete(resendMessageStream)
            })
            this.resendStreams.add(resendMessageStream)
            if (this.done) { return }

            for await (const streamMessage of resendMessageStream) {
                if (this.done) { return }
                this.orderingUtil.add(streamMessage)
            }
        } catch (err) {
            if (this.done) { return }

            if (err.code === 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                // if stream has no storage we can't do resends
                this.enabled = false // eslint-disable-line require-atomic-updates
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

    onOrdered(orderedMessage: StreamMessage) {
        if (this.outBuffer.isDone() || this.done) {
            return
        }

        this.outBuffer.push(orderedMessage as StreamMessage<T>)
    }

    stop() {
        return this.stopSignal.trigger()
    }

    maybeClose() {
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

    async addToOrderingUtil(src: AsyncGenerator<StreamMessage<T>>) {
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

    transform() {
        return async function* Transform(this: OrderMessages<T>, src: AsyncGenerator<StreamMessage<T>>) {
            if (!this.orderMessages) {
                yield* src
                return
            }

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
