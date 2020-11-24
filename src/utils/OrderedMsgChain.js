import debugFactory from 'debug'
import Heap from 'heap'
import EventEmitter from 'eventemitter3'

import GapFillFailedError from '../errors/GapFillFailedError'
import MessageRef from '../protocol/message_layer/MessageRef'

const debug = debugFactory('StreamrClient::OrderedMsgChain')
// The time it takes to propagate messages in the network. If we detect a gap, we first wait this amount of time because the missing
// messages might still be propagated.
const DEFAULT_PROPAGATION_TIMEOUT = 5000
// The round trip time it takes to request a resend and receive the answer. If the messages are still missing after the propagation
// delay, we request a resend and periodically wait this amount of time before requesting it again.
const DEFAULT_RESEND_TIMEOUT = 5000
const MAX_GAP_REQUESTS = 10

export default class OrderedMsgChain extends EventEmitter {
    constructor(
        publisherId, msgChainId, inOrderHandler, gapHandler,
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT,
    ) {
        super()
        this.publisherId = publisherId
        this.msgChainId = msgChainId
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.lastReceivedMsgRef = null
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        /* eslint-disable arrow-body-style */
        this.queue = new Heap((msg1, msg2) => {
            return msg1.getMessageRef().compareTo(msg2.getMessageRef())
        })
        /* eslint-enable arrow-body-style */
    }

    add(unorderedStreamMessage) {
        const msgRef = unorderedStreamMessage.getMessageRef()
        if (this.lastReceivedMsgRef && msgRef.compareTo(this.lastReceivedMsgRef) <= 0) {
            // Prevent double-processing of messages for any reason
            debug('Already received message: %o, lastReceivedMsgRef: %o. Ignoring message.', msgRef, this.lastReceivedMsgRef)
            return
        }

        if (this._isNextMessage(unorderedStreamMessage)) {
            this._process(unorderedStreamMessage)
        } else {
            this.queue.push(unorderedStreamMessage)
        }
        this._checkQueue()
    }

    markMessageExplicitly(streamMessage) {
        if (streamMessage) {
            if (this._isNextMessage(streamMessage)) {
                this.lastReceivedMsgRef = streamMessage.getMessageRef()
            }
        }
    }

    clearGap() {
        this.inProgress = false
        clearInterval(this.nextGaps)
        this.nextGaps = undefined
        clearTimeout(this.firstGap)
        this.firstGap = undefined
    }

    _isNextMessage(unorderedStreamMessage) {
        const isFirstMessage = this.lastReceivedMsgRef === null
        return isFirstMessage
            // is chained and next
            || (unorderedStreamMessage.prevMsgRef !== null && unorderedStreamMessage.prevMsgRef.compareTo(this.lastReceivedMsgRef) === 0)
            // is unchained and newer
            || (unorderedStreamMessage.prevMsgRef === null && unorderedStreamMessage.getMessageRef().compareTo(this.lastReceivedMsgRef) > 0)
    }

    _checkQueue() {
        while (!this.queue.empty()) {
            const msg = this.queue.peek()
            if (msg && this._isNextMessage(msg)) {
                this.queue.pop()
                // If the next message is found in the queue, current gap must have been filled, so clear the timer
                this.clearGap()
                this._process(msg)
            } else {
                this._scheduleGap(msg)
                break
            }
        }
    }

    _process(msg) {
        this.lastReceivedMsgRef = msg.getMessageRef()
        this.inOrderHandler(msg)
    }

    _scheduleGap() {
        if (this.inProgress) {
            return
        }

        this.gapRequestCount = 0
        this.inProgress = true
        clearTimeout(this.firstGap)
        this.firstGap = setTimeout(() => {
            this._requestGapFill()
            clearTimeout(this.nextGaps)
            this.nextGaps = setInterval(() => {
                if (this.inProgress) {
                    this._requestGapFill()
                }
            }, this.resendTimeout)
        }, this.propagationTimeout)
    }

    _requestGapFill() {
        const from = new MessageRef(this.lastReceivedMsgRef.timestamp, this.lastReceivedMsgRef.sequenceNumber + 1)
        const to = this.queue.peek().prevMsgRef
        if (this.gapRequestCount < MAX_GAP_REQUESTS) {
            this.gapRequestCount += 1
            this.gapHandler(from, to, this.publisherId, this.msgChainId)
        } else {
            this.emit('error', new GapFillFailedError(from, to, this.publisherId, this.msgChainId, MAX_GAP_REQUESTS))
            this.clearGap()
            this.lastReceivedMsgRef = null
            this._checkQueue()
        }
    }
}
OrderedMsgChain.MAX_GAP_REQUESTS = MAX_GAP_REQUESTS
