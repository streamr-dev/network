import { EventEmitter } from 'events'

import debugFactory from 'debug'
import Heap from 'heap'
import StrictEventEmitter from 'strict-event-emitter-types';

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

export type MessageHandler = (msg: StreamMessage) => void
export type GapHandler = (from: MessageRef, to: MessageRef, publisherId: string, msgChainId: string) => void

interface Events {
    skip: MessageHandler;
    drain: () => void;
    error: (error: Error) => void;
}

export const MsgChainEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, Events> }

class OrderedMsgChain extends MsgChainEmitter {
    queue: Heap<StreamMessage>
    lastReceivedMsgRef: MessageRef | null = null
    inProgress: boolean = false
    gapRequestCount: number = 0
    maxGapRequests: number = MAX_GAP_REQUESTS
    nextGaps: ReturnType<typeof setTimeout> | null = null
    firstGap: ReturnType<typeof setTimeout> | null = null
    markedExplicitly: WeakSet<StreamMessage> = new WeakSet()
    static MAX_GAP_REQUESTS = MAX_GAP_REQUESTS
    publisherId: string
    msgChainId: string
    inOrderHandler: MessageHandler
    gapHandler: GapHandler
    propagationTimeout: number
    resendTimeout: number

    constructor(
        publisherId: string, msgChainId: string, inOrderHandler: MessageHandler, gapHandler: GapHandler,
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT, maxGapRequests = MAX_GAP_REQUESTS
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
        this.maxGapRequests = maxGapRequests
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

    isGapHandlingEnabled() {
        return this.maxGapRequests > 0
    }

    add(unorderedStreamMessage: StreamMessage) {
        if (this.isStaleMessage(unorderedStreamMessage)) {
            const msgRef = unorderedStreamMessage.getMessageRef()
            // Prevent double-processing of messages for any reason
            debug('Already received message: %o, lastReceivedMsgRef: %o. Ignoring message.', msgRef, this.lastReceivedMsgRef)
            return
        }

        // gap handling disabled
        if (!this.isGapHandlingEnabled()) {
            this.markMessage(unorderedStreamMessage)
        }

        if (this.isNextMessage(unorderedStreamMessage)) {
            this.process(unorderedStreamMessage)
        } else {
            this.queue.push(unorderedStreamMessage)
        }

        this.checkQueue()
    }

    private markMessage(streamMessage: StreamMessage) {
        if (!streamMessage || this.isStaleMessage(streamMessage)) {
            // do nothing if already past/handled this message
            return false
        }

        this.markedExplicitly.add(streamMessage)
        return true
    }

    markMessageExplicitly(streamMessage: StreamMessage) {
        if (this.markMessage(streamMessage)) {
            this.add(streamMessage)
        }
    }

    clearGap() {
        this.inProgress = false
        clearTimeout(this.firstGap!)
        clearInterval(this.nextGaps!)
        this.nextGaps = null
        this.firstGap = null
    }

    isEmpty() {
        return this.queue.empty()
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
            if (msg && (this.isNextMessage(msg) || this.markedExplicitly.has(msg))) {
                this.queue.pop()
                // If the next message is found in the queue, current gap must have been filled, so clear the timer
                this.clearGap()
                this.process(msg)
            } else {
                this.scheduleGap()
                break
            }
        }

        if (this.queue.empty()) {
            this.clearGap()
            this.emit('drain')
        }
    }

    private process(msg: StreamMessage) {
        this.lastReceivedMsgRef = msg.getMessageRef()
        if (this.markedExplicitly.has(msg)) {
            this.markedExplicitly.delete(msg)
            if (this.isGapHandlingEnabled()) {
                this.emit('skip', msg)
                return
            }
        }
        this.inOrderHandler(msg)
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
        if (!this.inProgress || this.isEmpty()) { return }
        const from = new MessageRef(this.lastReceivedMsgRef!.timestamp, this.lastReceivedMsgRef!.sequenceNumber + 1)
        const to = this.queue.peek().prevMsgRef!
        const { maxGapRequests } = this
        if (this.gapRequestCount! < maxGapRequests) {
            this.gapRequestCount! += 1
            this.gapHandler(from, to, this.publisherId, this.msgChainId)
        } else {
            const msg = this.queue.peek()
            if (msg && !this.isNextMessage(msg)) {
                this.lastReceivedMsgRef = msg.getPreviousMessageRef()
                this.emit('error', new GapFillFailedError(from, to, this.publisherId, this.msgChainId, maxGapRequests))
                this.clearGap()
                this.checkQueue()
            }
        }
    }
}

export default OrderedMsgChain;
