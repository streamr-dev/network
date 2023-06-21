import { MessageRef, StreamMessage, StreamPartID } from '@streamr/protocol'
import { EthereumAddress, Logger } from '@streamr/utils'
import Heap from 'heap'
import GapFillFailedError from './GapFillFailedError'

function toMsgRefId(streamMessage: StreamMessage): MsgRefId {
    return streamMessage.getMessageRef().serialize()
}

type MsgRefId = string

type ChainedMessage = StreamMessage & { prevMsgRef: NonNullable<StreamMessage['prevMsgRef']> }

export interface MsgChainContext {
    streamPartId: StreamPartID
    publisherId: EthereumAddress
    msgChainId: string
}

/**
 * Set of StreamMessages, unique by serialized msgRef i.e. timestamp + sequence number.
 */
class StreamMessageSet {

    private readonly msgMap = new Map<MsgRefId, StreamMessage>()

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
        return this.pendingMsgs.get(ref!)
    }

    /**
     * True if queue already has a message with this message ref.
     */
    has(streamMessage: StreamMessage): boolean {
        // prevent duplicates
        return this.pendingMsgs.has(streamMessage)
    }

    /**
     * Push new item into the queue.
     * Ignores duplicates.
     */
    push(streamMessage: StreamMessage): void {
        // prevent duplicates
        if (this.has(streamMessage)) { return }
        this.pendingMsgs.add(streamMessage)
        const msgRef = streamMessage.getMessageRef()
        this.queue.push(msgRef)
    }

    /**
     * Remove next item from queue and return it.
     */
    pop(): StreamMessage | undefined {
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
    isEmpty(): boolean {
        return this.queue.empty()
    }

    /**
     * Number of items in queue.
     */
    size(): number {
        return this.queue.size()
    }
}

export type MessageHandler = (msg: StreamMessage) => void
export type GapHandler = (from: MessageRef, to: MessageRef, context: MsgChainContext) => void | Promise<void>
export type OnDrain = (numMessages: number) => void
export type OnError = (error: Error) => void

const logger = new Logger(module)

export class OrderedMsgChain {

    private lastOrderedMsgRef: MessageRef | null = null
    private hasPendingGap = false
    private gapRequestCount = 0
    private maxGapRequests: number
    private nextGaps: ReturnType<typeof setTimeout> | null = null
    private readonly queue = new MsgChainQueue()
    private readonly markedExplicitly = new StreamMessageSet()
    private readonly context: MsgChainContext
    private readonly inOrderHandler: MessageHandler
    private readonly gapHandler: GapHandler
    private readonly onDrain: OnDrain
    private readonly onError: OnError
    private readonly gapFillTimeout: number
    private readonly retryResendAfter: number

    constructor(
        context: MsgChainContext,
        inOrderHandler: MessageHandler,
        gapHandler: GapHandler,
        onDrain: OnDrain,
        onError: OnError,
        gapFillTimeout: number,
        retryResendAfter: number,
        maxGapRequests: number
    ) {
        this.context = context
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.onDrain = onDrain
        this.onError = onError
        this.lastOrderedMsgRef = null
        this.gapFillTimeout = gapFillTimeout
        this.retryResendAfter = retryResendAfter
        this.maxGapRequests = maxGapRequests
    }

    /**
     * Messages are stale if they are already enqueued or last ordered message is newer.
     */
    private isStaleMessage(streamMessage: StreamMessage): boolean {
        const msgRef = streamMessage.getMessageRef()
        return !!(
            // already enqueued
            this.queue.has(streamMessage) || (
                this.lastOrderedMsgRef
                // or older/equal to last ordered msgRef
                && msgRef.compareTo(this.lastOrderedMsgRef) <= 0
            )
        )
    }

    /**
     * Add message to queue.
     */
    add(unorderedStreamMessage: StreamMessage): void {
        if (this.isStaleMessage(unorderedStreamMessage)) {
            const msgRef = unorderedStreamMessage.getMessageRef()
            // Prevent double-processing of messages for any reason
            logger.trace('Ignore message (already enqueued or processed a newer message)', {
                ignoredMsgRef: msgRef,
                lastMsgRef: this.lastOrderedMsgRef
            })
            return
        }

        // gap handling disabled
        if (!this.isGapHandlingEnabled()) {
            this.markMessage(unorderedStreamMessage)
        }

        this.queue.push(unorderedStreamMessage)
        this.checkQueue()
    }

    /**
     * Adds message to set of marked messages.
     * Does nothing and returns false if message is stale.
     */
    private markMessage(streamMessage: StreamMessage): boolean {
        if (!streamMessage || this.isStaleMessage(streamMessage)) {
            // do nothing if already past/handled this message
            return false
        }

        if (this.isGapHandlingEnabled()) {
            logger.trace('markMessage', { msgRef: streamMessage.getMessageRef() })
        }

        this.markedExplicitly.add(streamMessage)
        return true
    }

    /**
     * Cancel any outstanding gap fill request.
     */
    clearGap(): void {
        if (this.hasPendingGap) {
            logger.trace('clearGap')
        }
        this.hasPendingGap = false
        clearTimeout(this.nextGaps!)
        this.nextGaps = null
    }

    disable(): void {
        this.maxGapRequests = 0
        this.clearGap()
        this.checkQueue()
    }

    private isGapHandlingEnabled(): boolean {
        return this.maxGapRequests > 0
    }

    /**
     * True if queue is empty.
     */
    isEmpty(): boolean {
        return this.queue.isEmpty()
    }

    /**
     * True if the next queued message is the next message in the chain.
     * Always true for first message and unchained messages i.e. messages without a prevMsgRef.
     */
    private hasNextMessageInChain(): boolean {
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

    /**
     * Keep popping messages until we hit a gap or run out of messages.
     */
    private checkQueue(): void {
        let processedMessages = 0
        while (this.hasNextMessageInChain()) {
            processedMessages += 1
            this.pop()
        }

        // if queue not empty then we have a gap
        if (!this.queue.isEmpty()) {
            this.scheduleGap()
            return
        }

        // emit drain after clearing a block. If only a single item was in the
        // queue, the queue was never blocked, so it doesn't need to 'drain'.
        if (processedMessages > 1) {
            logger.trace('Drained queue', { processedMessages, lastMsgRef: this.lastOrderedMsgRef })
            this.clearGap()
            this.onDrain(processedMessages)
        }
    }

    /**
     * Remove next message from queue and run it through inOrderHandler if valid.
     */
    private pop(): StreamMessage | undefined {
        const msg = this.queue.pop()
        if (!msg) { return }
        this.lastOrderedMsgRef = msg.getMessageRef()
        try {
            if (this.markedExplicitly.has(msg)) {
                this.markedExplicitly.delete(msg)

                if (this.isGapHandlingEnabled()) {
                    logger.trace('Skipped message', { msgRef: msg.getMessageRef() })
                    return msg
                }
            }

            this.inOrderHandler(msg)
        } catch (err: any) {
            this.onError(err)
        }
        return msg
    }

    /**
     * Schedule a requestGapFill call.
     */
    private scheduleGap(): void {
        if (this.hasPendingGap) { return }

        this.gapRequestCount = 0
        this.hasPendingGap = true

        if (!this.isGapHandlingEnabled()) {
            this.onGapFillsExhausted()
            return
        }

        logger.trace('scheduleGap', { timeoutMs: this.gapFillTimeout })
        const nextGap = (timeout: number) => {
            clearTimeout(this.nextGaps!)
            this.nextGaps = setTimeout(async () => {
                if (!this.hasPendingGap) { return }
                await this.requestGapFill()
                if (!this.hasPendingGap) { return }
                nextGap(this.retryResendAfter)
            }, timeout)
        }
        nextGap(this.gapFillTimeout)
    }

    /**
     * Call gapHandler until run out of gapRequests.
     * Failure emits an error and sets up to continue processing enqueued messages after the gap.
     */
    private async requestGapFill(): Promise<void> {
        if (!this.hasPendingGap || this.isEmpty()) { return }
        const msg = this.queue.peek() as ChainedMessage
        const { lastOrderedMsgRef } = this
        if (!msg || !lastOrderedMsgRef) { return }
        // Note: msg will always have a prevMsgRef at this point. First message
        // & unchained messages won't trigger gapfill i.e. Only chained
        // messages (messages with a prevMsgRef) can block queue processing.
        // Unchained messages arriving after queue is blocked will get
        // processed immediately if they sort earlier than the blocking message
        // or they will get queued behind the chained message and will be
        // processed unconditionally as soon as the queue is unblocked.
        const to = msg.prevMsgRef
        const from = new MessageRef(lastOrderedMsgRef.timestamp, lastOrderedMsgRef.sequenceNumber + 1)
        const { gapRequestCount, maxGapRequests } = this
        if (gapRequestCount < maxGapRequests) {
            logger.trace('requestGapFill', {
                attemptNo: gapRequestCount + 1,
                maxAttempts: maxGapRequests,
                from,
                to,
            })
            this.gapRequestCount += 1
            try {
                await this.gapHandler(from, to, this.context)
            } catch (err: any) {
                this.onError(err)
            }
        } else {
            this.onGapFillsExhausted()
        }
    }

    private onGapFillsExhausted() {
        if (!this.hasPendingGap || this.isEmpty()) { return }
        const { maxGapRequests } = this
        const msg = this.queue.peek() as ChainedMessage
        const { lastOrderedMsgRef } = this
        if (!msg || !lastOrderedMsgRef) { return }

        const to = msg.prevMsgRef
        const from = new MessageRef(lastOrderedMsgRef.timestamp, lastOrderedMsgRef.sequenceNumber + 1)
        if (this.isGapHandlingEnabled()) {
            logger.trace('requestGapFill failed after reaching max attempts', {
                maxGapRequests,
                from,
                to
            })
        }

        // skip gap, allow queue processing to continue
        this.lastOrderedMsgRef = msg.getPreviousMessageRef()
        if (this.isGapHandlingEnabled()) {
            this.onError(new GapFillFailedError(from, to, this.context, maxGapRequests))
        }

        this.clearGap()
        // keep processing
        this.checkQueue()
    }
}
