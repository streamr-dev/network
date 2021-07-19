import { OrderingUtil, StreamMessage, SPID } from 'streamr-client-protocol'

import { PushBuffer } from '../utils/PushBuffer'
import { counterId } from '../utils'

import { BrubeckClient } from './BrubeckClient'
import MessageStream from './MessageStream'

/**
 * Wraps OrderingUtil into a PushBuffer.
 * Implements gap filling
 */

export default function OrderMessages<T>(client: BrubeckClient, spid: SPID, options: any = {}) {
    return async function* OrderMessagesGenerator(src: AsyncGenerator<StreamMessage<T>>) {
        const { gapFillTimeout, retryResendAfter, maxGapRequests, orderMessages } = client.options
        const { gapFill = true } = options
        const id = counterId('OrderMessages')
        let enabled = !!(orderMessages && gapFill && maxGapRequests)
        const debug = client.debug.extend(id)

        let done = false
        const resendStreams = new Set<MessageStream<T>>() // holds outstanding resends for cleanup
        const outBuffer = new PushBuffer<StreamMessage<T>>()

        const orderingUtil = new OrderingUtil(spid.streamId, spid.streamPartition, (orderedMessage) => {
            if (outBuffer.isDone() || done) {
                return
            }

            outBuffer.push(orderedMessage as StreamMessage<T>)
        }, async (from, to, publisherId, msgChainId) => {
            if (done || !enabled) { return }
            debug('gap %o', {
                spid, publisherId, msgChainId, from, to,
            })

            let resendMessageStream!: MessageStream<T>

            try {
                resendMessageStream = await client.resends.range(spid, {
                    fromTimestamp: from.timestamp,
                    toTimestamp: to.timestamp,
                    fromSequenceNumber: from.sequenceNumber,
                    toSequenceNumber: to.sequenceNumber,
                    publisherId,
                    msgChainId,
                })
                resendMessageStream.onFinally(() => {
                    resendStreams.delete(resendMessageStream)
                })
                resendStreams.add(resendMessageStream)
                if (done) { return }

                for await (const streamMessage of resendMessageStream) {
                    if (done) { return }
                    orderingUtil.add(streamMessage)
                }
            } catch (err) {
                if (done) { return }

                if (err.code === 'NO_STORAGE_NODES') {
                    // ignore NO_STORAGE_NODES errors
                    // if stream has no storage we can't do resends
                    enabled = false // eslint-disable-line require-atomic-updates
                    orderingUtil.disable()
                } else {
                    outBuffer.endWrite(err)
                }
            } finally {
                if (resendMessageStream != null) {
                    resendStreams.delete(resendMessageStream)
                }
            }
        }, gapFillTimeout, retryResendAfter, enabled ? maxGapRequests : 0)

        let inputClosed = false

        function maybeClose() {
            // we can close when:
            // input has closed (i.e. all messages sent)
            // AND
            // no gaps are pending
            // AND
            // gaps have been filled or failed
            // NOTE ordering util cannot have gaps if queue is empty
            if (inputClosed && orderingUtil.isEmpty()) {
                outBuffer.endWrite()
            }
        }

        orderingUtil.on('drain', () => {
            maybeClose()
        })

        orderingUtil.on('error', () => {
            // TODO: handle gapfill errors without closing stream or logging
            maybeClose() // probably noop
        })

        async function addToOrderingUtil() {
            try {
                for await (const msg of src) {
                    orderingUtil.add(msg)
                }
                inputClosed = true
                maybeClose()
            } catch (err) {
                outBuffer.endWrite(err)
            }
        }

        try {
            addToOrderingUtil()
            yield* outBuffer
        } finally {
            done = true
            orderingUtil.clearGaps()
            resendStreams.forEach((s) => s.end())
            resendStreams.clear()
            orderingUtil.clearGaps()
        }
    }
}
