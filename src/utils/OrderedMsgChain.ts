import { EventEmitter } from 'events'

import Debug from 'debug'
import Heap from 'heap'
import StrictEventEmitter from 'strict-event-emitter-types';

import GapFillFailedError from '../errors/GapFillFailedError'
import MessageRef from '../protocol/message_layer/MessageRef'

import StreamMessage from '../protocol/message_layer/StreamMessage'

function toMsgRefId(streamMessage: StreamMessage): MsgRefId {
    return streamMessage.getMessageRef().serialize()
}

type MsgRefId = string

/**
 * Set of StreamMessages, unique by serialized msgRef i.e. timestamp + sequence number.
 */
class StreamMessageSet {
    msgMap = new Map<MsgRefId, StreamMessage>()

    has(streamMessage: StreamMessage) {
        return this.msgMap.has(toMsgRefId(streamMessage))
    }

    /**
     * Get StreamMessage associated with this msgRef
     */
    get(msgRef: MessageRef) {
        return this.msgMap.get(msgRef.serialize())
    }

    delete(streamMessage: StreamMessage) {
        return this.msgMap.delete(toMsgRefId(streamMessage))
    }

    add(streamMessage: StreamMessage) {
        if (!this.has(streamMessage)) {
            return this.msgMap.set(toMsgRefId(streamMessage), streamMessage)
        }
        return this
    }

    size() {
        return this.msgMap.size
    }
}

/**
 * Ordered queue of StreamMessages.
 * Deduplicated by serialized msgRef.
 */

class MsgChainQueue {

    /**
     * Ordered message refs
     */
    private queue = new Heap<MessageRef>((msg1: MessageRef, msg2: MessageRef) => {
        return msg1.compareTo(msg2)
    })

    /**
     * Mapping from msgRef to message.
     */
    private pendingMsgs = new StreamMessageSet()

    /**
     * Peek at next message in-order.
     */
    peek() {
        if (this.isEmpty()) { return }
        const ref = this.queue.peek()
        return this.pendingMsgs.get(ref)
    }

    /**
     * True if queue already has a message with this message ref.
     */
    has(streamMessage: StreamMessage) {
        // prevent duplicates
        return this.pendingMsgs.has(streamMessage)
    }

    /**
     * Push new item into the queue.
     * Ignores duplicates.
     */
    push(streamMessage: StreamMessage) {
        // prevent duplicates
        if (this.has(streamMessage)) { return }
        this.pendingMsgs.add(streamMessage)
        const msgRef = streamMessage.getMessageRef()
        this.queue.push(msgRef)
    }

    /**
     * Remove next item from queue and return it.
     */
    pop() {
        if (this.isEmpty()) { return }
        const streamMessage = this.peek()
        if (!streamMessage) { return }
        this.queue.pop()
        this.pendingMsgs.delete(streamMessage)
        return streamMessage
    }

    /**
     * True if there are no items in the queue.
     */
    isEmpty() {
        return this.queue.empty()
    }

    /**
     * Number of items in queue.
     */
    size() {
        return this.queue.size()
    }
}

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
    drain: (numMesssages: number) => void;
    error: (error: Error) => void;
}

export const MsgChainEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, Events> }

let ID = 0
class OrderedMsgChain extends MsgChainEmitter {
    queue = new MsgChainQueue()
    lastOrderedMsgRef: MessageRef | null = null
    inProgress: boolean = false
    gapRequestCount: number = 0
    maxGapRequests: number = MAX_GAP_REQUESTS
    publisherId: string
    msgChainId: string
    inOrderHandler: MessageHandler
    gapHandler: GapHandler
    propagationTimeout: number
    resendTimeout: number
    nextGaps: ReturnType<typeof setTimeout> | null = null
    firstGap: ReturnType<typeof setTimeout> | null = null
    markedExplicitly = new StreamMessageSet()
    debug: ReturnType<typeof Debug>

    constructor(
        publisherId: string, msgChainId: string, inOrderHandler: MessageHandler, gapHandler: GapHandler,
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT, maxGapRequests = MAX_GAP_REQUESTS
    ) {
        super()
        ID += 1
        this.debug = Debug(`StreamrClient::OrderedMsgChain::${ID}::${msgChainId}`)
        this.publisherId = publisherId
        this.msgChainId = msgChainId
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.lastOrderedMsgRef = null
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        this.maxGapRequests = maxGapRequests

        if (!this.isGapHandlingEnabled()) {
            this.debug('Gap handling disabled for this %s.', this.constructor.name)
        }
    }

    isStaleMessage(streamMessage: StreamMessage) {
        const msgRef = streamMessage.getMessageRef()
        return (
            // already enqueued
            this.queue.has(streamMessage) || (
                this.lastOrderedMsgRef
                // or older/equal to last ordered msgRef
                && msgRef.compareTo(this.lastOrderedMsgRef) <= 0
            )
        )
    }

    isGapHandlingEnabled() {
        return this.maxGapRequests > 0
    }

    add(unorderedStreamMessage: StreamMessage) {
        if (this.isStaleMessage(unorderedStreamMessage)) {
            const msgRef = unorderedStreamMessage.getMessageRef()
            // Prevent double-processing of messages for any reason
            this.debug('Already received message: %o, lastOrderedMsgRef: %o. Ignoring message.', msgRef, this.lastOrderedMsgRef)
            return
        }

        // gap handling disabled
        if (!this.isGapHandlingEnabled()) {
            this.markMessage(unorderedStreamMessage)
        }

        this.queue.push(unorderedStreamMessage)
        this.checkQueue()
    }

    private markMessage(streamMessage: StreamMessage) {
        if (!streamMessage || this.isStaleMessage(streamMessage)) {
            // do nothing if already past/handled this message
            return false
        }

        if (this.isGapHandlingEnabled()) {
            this.debug('marking message', streamMessage.getMessageRef())
        }

        this.markedExplicitly.add(streamMessage)
        return true
    }

    /**
     * Mark a message to have it be treated as the next message & not trigger gap fill
     */
    markMessageExplicitly(streamMessage: StreamMessage) {
        if (this.markMessage(streamMessage)) {
            this.add(streamMessage)
        }
    }

    clearGap() {
        if (this.inProgress) {
            this.debug('clearGap')
        }
        this.inProgress = false
        clearTimeout(this.firstGap!)
        clearInterval(this.nextGaps!)
        this.nextGaps = null
        this.firstGap = null
    }

    isEmpty() {
        return this.queue.isEmpty()
    }

    size() {
        return this.queue.size()
    }

    private hasNextMessageQueued() {
        const streamMessage = this.queue.peek()
        if (!streamMessage) { return false }
        const { prevMsgRef } = streamMessage
        // is first message
        if (this.lastOrderedMsgRef === null) { return true }
        if (prevMsgRef !== null) {
            // if has prev, message is chained: ensure prev points at last ordered message
            return prevMsgRef.compareTo(this.lastOrderedMsgRef) === 0
        } else {
            // without prev, message is unchained.
            // only first message in chain should have no prev
            // This assumes it's the next message if it's newer
            // and relies on queue pre-sorting messages
            return streamMessage.getMessageRef().compareTo(this.lastOrderedMsgRef) > 0
        }
    }

    private checkQueue() {
        let processedMessages = 0
        while (this.hasNextMessageQueued()) {
            processedMessages += 1
            this.pop()
        }


        // if queue not empty then we have a gap
        if (!this.queue.isEmpty()) {
            this.scheduleGap()
            return
        }

        // emit drain if queue empty & had more than one queued message
        if (processedMessages > 1) {
            this.debug('queue drained', processedMessages, this.lastOrderedMsgRef)
            this.clearGap()
            this.emit('drain', processedMessages)
        }
    }

    private pop() {
        const msg = this.queue.pop()
        if (!msg) { return }
        // gaps don't make sense while we are still able to pop items
        this.clearGap()
        this.lastOrderedMsgRef = msg.getMessageRef()
        try {
            if (this.markedExplicitly.has(msg)) {
                this.markedExplicitly.delete(msg)

                if (this.isGapHandlingEnabled()) {
                    this.debug('skipping message', msg.getMessageRef())
                    this.emit('skip', msg)
                    return msg
                }
            }

            this.inOrderHandler(msg)
        } catch (err) {
            this.emit('error', err)
        }
        return msg
    }

    private scheduleGap() {
        if (this.inProgress) { return }
        this.gapRequestCount = 0
        this.inProgress = true
        clearTimeout(this.firstGap!)
        this.debug('scheduleGap in %dms', this.propagationTimeout)
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
        const msg = this.queue.peek()
        const { lastOrderedMsgRef } = this
        if (!msg || !lastOrderedMsgRef) { return }
        const to = msg.prevMsgRef!
        const from = new MessageRef(lastOrderedMsgRef.timestamp, lastOrderedMsgRef.sequenceNumber + 1)
        const { gapRequestCount, maxGapRequests } = this
        if (gapRequestCount! < maxGapRequests) {
            this.debug('requestGapFill %d of %d: %o', gapRequestCount + 1, maxGapRequests, {
                from,
                to,
            })
            this.gapRequestCount += 1
            if (from.compareTo(to) > 0) {
                setTimeout(() => {
                    process.exit(1)
                }, 0)
                return
            }
            try {
                this.gapHandler(from, to, this.publisherId, this.msgChainId)
            } catch (err) {
                this.emit('error', err)
            }
        } else {
            if (!this.isEmpty()) {
                this.debug('requestGapFill failed after %d attempts: %o', maxGapRequests, {
                    from,
                    to,
                })
                this.debugStatus()
                this.debug('lastOrderedMsgRef A2', this.markedExplicitly.has(msg), this.lastOrderedMsgRef)
                this.lastOrderedMsgRef = msg.getPreviousMessageRef()
                this.debug('lastOrderedMsgRef B2', this.markedExplicitly.has(msg), this.lastOrderedMsgRef)
                this.emit('error', new GapFillFailedError(from, to, this.publisherId, this.msgChainId, maxGapRequests))
                this.clearGap()
                this.checkQueue()
            }
        }
    }

    debugStatus() {
        this.debug('Up to %o: %o', this.lastOrderedMsgRef, {
            gapRequestCount: this.gapRequestCount,
            maxGapRequests: this.maxGapRequests,
            size: this.queue.size(),
            isEmpty: this.isEmpty(),
            inProgress: this.inProgress,
            markedExplicitly: this.markedExplicitly.size()
        })
    }
}

export default OrderedMsgChain;
