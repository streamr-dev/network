import { Utils } from 'streamr-client-protocol'

import { pipeline } from '../utils/iterators'
import PushQueue from '../utils/PushQueue'
import { validateOptions } from '../stream/utils'

import resendStream from './resendStream'

const { OrderingUtil } = Utils

let ID = 0

/**
 * Wraps OrderingUtil into a pipeline.
 * Implements gap filling
 */

export default function OrderMessages(client, options = {}) {
    const { gapFillTimeout, retryResendAfter, maxGapRequests, orderMessages } = client.options
    const { streamId, streamPartition, gapFill = true } = validateOptions(options)
    let enabled = !!(orderMessages && gapFill && maxGapRequests)
    const debug = client.debug.extend(`OrderMessages::${ID}`)
    ID += 1

    // output buffer
    const outStream = new PushQueue([], {
        autoEnd: false,
    })

    let done = false
    const resendStreams = new Set() // holds outstanding resends for cleanup

    const orderingUtil = new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
        if (!outStream.isWritable() || done) {
            return
        }
        outStream.push(orderedMessage)
    }, async (from, to, publisherId, msgChainId) => {
        if (done || !enabled) { return }
        debug('gap %o', {
            streamId, streamPartition, publisherId, msgChainId, from, to,
        })

        // eslint-disable-next-line no-use-before-define
        const resendMessageStream = resendStream(client, {
            streamId, streamPartition, from, to, publisherId, msgChainId,
        })

        try {
            resendStreams.add(resendMessageStream)
            await resendMessageStream.subscribe()
            if (done) { return }

            for await (const { streamMessage } of resendMessageStream) {
                if (done) { return }
                orderingUtil.add(streamMessage)
            }
        } catch (err) {
            if (done) { return }

            if (err.code === 'NO_STORAGE_NODES') {
                // ignore NO_STORAGE_NODES errors
                // if stream has no storage we can't do resends
                enabled = false
                orderingUtil.disable()
            } else {
                outStream.push(err)
            }
        } finally {
            resendStreams.delete(resendMessageStream)
            await resendMessageStream.cancel()
        }
    }, gapFillTimeout, retryResendAfter, enabled ? maxGapRequests : 0)

    const markMessageExplicitly = orderingUtil.markMessageExplicitly.bind(orderingUtil)

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
            outStream.end()
        }
    }

    orderingUtil.on('drain', () => {
        maybeClose()
    })

    orderingUtil.on('error', () => {
        // TODO: handle gapfill errors without closing stream or logging
        maybeClose() // probably noop
    })

    return Object.assign(pipeline([
        // eslint-disable-next-line require-yield
        async function* WriteToOrderingUtil(src) {
            for await (const msg of src) {
                orderingUtil.add(msg)
                // note no yield
                // orderingUtil writes to outStream itself
            }
            inputClosed = true
            maybeClose()
        },
        outStream, // consumer gets outStream
    ], async (err) => {
        done = true
        orderingUtil.clearGaps()
        resendStreams.forEach((s) => s.cancel())
        resendStreams.clear()
        await outStream.cancel(err)
        orderingUtil.clearGaps()
    }), {
        markMessageExplicitly,
    })
}
