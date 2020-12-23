import debugFactory from 'debug'
import Heap from 'heap'
import EventEmitter from 'eventemitter3'

import GapFillFailedError from '../errors/GapFillFailedError'
import MessageRef from '../protocol/message_layer/MessageRef'

import StreamMessage from '../protocol/message_layer/StreamMessage'

const debug = debugFactory('StreamrClient::OrderedMsgChain')
// The time it takes to propagate messages in the network. If we detect a gap, we first wait this amount of time because the missing
// messages might still be propagated.
const DEFAULT_PROPAGATION_TIMEOUT = 5000
// The round trip time it takes to request a resend and receive the answer. If the messages are still missing after the propagation
// delay, we request a resend and periodically wait this amount of time before requesting it again.
const DEFAULT_RESEND_TIMEOUT = 5000
const MAX_GAP_REQUESTS = 10

export type InOrderHandler = (msg: StreamMessage) => void
export type GapHandler = (from: MessageRef, to: MessageRef, publisherId: string, msgChainId: string) => void

export default class OrderedMsgChain extends EventEmitter {

    static MAX_GAP_REQUESTS = MAX_GAP_REQUESTS

    markedExplicitly: WeakSet<StreamMessage>
    publisherId: string
    msgChainId: string
    inOrderHandler: InOrderHandler
    gapHandler: GapHandler
    lastReceivedMsgRef: MessageRef | null
    propagationTimeout: number
    resendTimeout: number
    queue: Heap<StreamMessage>
    inProgress: boolean = false
    nextGaps: ReturnType<typeof setTimeout> | null = null
    firstGap: ReturnType<typeof setTimeout> | null = null
    gapRequestCount: number = 0 

    constructor(
        publisherId: string, msgChainId: string, inOrderHandler: InOrderHandler, gapHandler: GapHandler,
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT,
    ) {
        super()
        this.markedExplicitly = new WeakSet()
        this.publisherId = publisherId
        this.msgChainId = msgChainId
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.lastReceivedMsgRef = null
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        /* eslint-disable arrow-body-style */
        this.queue = new Heap((msg1: StreamMessage, msg2: StreamMessage) => {
            return msg1.getMessageRef().compareTo(msg2.getMessageRef())
        })
        /* eslint-enable arrow-body-style */
    }

    isStaleMessage(streamMessage: StreamMessage) {
        const msgRef = streamMessage.getMessageRef()
        return (
            this.lastReceivedMsgRef
            && msgRef.compareTo(this.lastReceivedMsgRef) <= 0
        )
    }

    add(unorderedStreamMessage: StreamMessage) {
        if (this.isStaleMessage(unorderedStreamMessage)) {
            const msgRef = unorderedStreamMessage.getMessageRef()
            // Prevent double-processing of messages for any reason
            debug('Already received message: %o, lastReceivedMsgRef: %o. Ignoring message.', msgRef, this.lastReceivedMsgRef)
            return
        }

        if (this.isNextMessage(unorderedStreamMessage)) {
            this.process(unorderedStreamMessage)
        } else {
            this.queue.push(unorderedStreamMessage)
        }

        this.checkQueue()
    }

    markMessageExplicitly(streamMessage: StreamMessage) {
        if (!streamMessage || this.isStaleMessage(streamMessage)) {
            // do nothing if already past/handled this message
            return
        }

        this.markedExplicitly.add(streamMessage)
        this.add(streamMessage)
    }

    clearGap() {
        this.inProgress = false
        clearTimeout(this.firstGap!)
        clearInterval(this.nextGaps!)
        this.nextGaps = null
        this.firstGap = null
    }

    private isNextMessage(unorderedStreamMessage: StreamMessage) {
        const isFirstMessage = this.lastReceivedMsgRef === null
        return isFirstMessage
            // is chained and next
            || (unorderedStreamMessage.prevMsgRef !== null && unorderedStreamMessage.prevMsgRef!.compareTo(this.lastReceivedMsgRef!) === 0)
            // is unchained and newer
            || (unorderedStreamMessage.prevMsgRef === null && unorderedStreamMessage.getMessageRef().compareTo(this.lastReceivedMsgRef!) > 0)
    }

    private checkQueue() {
        while (!this.queue.empty()) {
            const msg = this.queue.peek()
            if (msg && this.isNextMessage(msg)) {
                this.queue.pop()
                // If the next message is found in the queue, current gap must have been filled, so clear the timer
                this.clearGap()
                this.process(msg)
            } else {
                this.scheduleGap()
                break
            }
        }
    }

    private process(msg: StreamMessage) {
        this.lastReceivedMsgRef = msg.getMessageRef()

        if (this.markedExplicitly.has(msg)) {
            this.markedExplicitly.delete(msg)
            this.emit('skip', msg)
        } else {
            this.inOrderHandler(msg)
        }
    }

    private scheduleGap() {
        if (this.inProgress) {
            return
        }

        this.gapRequestCount = 0
        this.inProgress = true
        clearTimeout(this.firstGap!)
        this.firstGap = setTimeout(() => {
            this.requestGapFill()
            if (!this.inProgress) { return }
            clearInterval(this.nextGaps!)
            this.nextGaps = setInterval(() => {
                if (!this.inProgress) {
                    clearInterval(this.nextGaps!)
                    return
                }
                this.requestGapFill()
            }, this.resendTimeout)
        }, this.propagationTimeout)
    }

    private requestGapFill() {
        if (!this.inProgress) { return }
        const from = new MessageRef(this.lastReceivedMsgRef!.timestamp, this.lastReceivedMsgRef!.sequenceNumber + 1)
        const to = this.queue.peek().prevMsgRef!
        if (this.gapRequestCount! < MAX_GAP_REQUESTS) {
            this.gapRequestCount! += 1
            this.gapHandler(from, to, this.publisherId, this.msgChainId)
        } else {
            this.emit('error', new GapFillFailedError(from, to, this.publisherId, this.msgChainId, MAX_GAP_REQUESTS))
            this.clearGap()
            this.lastReceivedMsgRef = null
            this.checkQueue()
        }
    }
}
