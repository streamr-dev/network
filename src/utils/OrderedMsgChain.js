import debugFactory from 'debug'
import Heap from 'heap'
import EventEmitter from 'eventemitter3'

import GapFillFailedError from '../errors/GapFillFailedError'
import MessageRef from '../protocol/message_layer/MessageRef'

const debug = debugFactory('StreamrClient::OrderedMsgChain')
const DEFAULT_GAPFILL_TIMEOUT = 5000
const MAX_GAP_REQUESTS = 10

export default class OrderedMsgChain extends EventEmitter {
    constructor(publisherId, msgChainId, inOrderHandler, gapHandler, gapFillTimeout = DEFAULT_GAPFILL_TIMEOUT) {
        super()
        this.publisherId = publisherId
        this.msgChainId = msgChainId
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.lastReceivedMsgRef = null
        this.gapFillTimeout = gapFillTimeout
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
            debug('Already received message: %o, lastReceivedMsgRef: %d. Ignoring message.', msgRef, this.lastReceivedMsgRef)
            return
        }

        if (this._isNextMessage(unorderedStreamMessage)) {
            this._process(unorderedStreamMessage)
            this._checkQueue()
        } else {
            if (!this.gap) {
                this._scheduleGap()
            }
            this.queue.push(unorderedStreamMessage)
        }
    }

    markMessageExplicitly(streamMessage) {
        if (streamMessage) {
            if (this._isNextMessage(streamMessage)) {
                this.lastReceivedMsgRef = streamMessage.getMessageRef()
            }
        }
    }

    clearGap() {
        clearInterval(this.gap)
        this.gap = undefined
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
                // If the next message is found in the queue, any gap must have been filled, so clear the timer
                this.clearGap()
                this._process(msg)
            } else {
                return
            }
        }
    }

    _process(msg) {
        this.lastReceivedMsgRef = msg.getMessageRef()
        this.inOrderHandler(msg)
    }

    _scheduleGap() {
        this.gapRequestCount = 0
        this.gap = setInterval(() => {
            const from = new MessageRef(this.lastReceivedMsgRef.timestamp, this.lastReceivedMsgRef.sequenceNumber + 1)
            const to = this.queue.peek().prevMsgRef
            if (this.gapRequestCount < MAX_GAP_REQUESTS) {
                this.gapRequestCount += 1
                this.gapHandler(from, to, this.publisherId, this.msgChainId)
            } else {
                this.emit('error', new GapFillFailedError(from, to, this.publisherId, this.msgChainId, MAX_GAP_REQUESTS))
                this.clearGap()
            }
        }, this.gapFillTimeout)
    }
}
OrderedMsgChain.MAX_GAP_REQUESTS = MAX_GAP_REQUESTS
