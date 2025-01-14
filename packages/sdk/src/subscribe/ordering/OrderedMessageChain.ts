import { Gate, Heap, Logger, StreamPartID, UserID } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { MessageRef } from '../../protocol/MessageRef'
import { StreamMessage } from '../../protocol/StreamMessage'

/*
 * There are missing messages between these two messages. The "to" message is guaranteed to have prevMsgRef.
 */
export interface Gap {
    from: StreamMessage
    to: StreamMessage
}

export interface OrderedMessageChainContext {
    streamPartId: StreamPartID
    publisherId: UserID
    msgChainId: string
}

export interface Events {
    orderedMessageAdded: (msg: StreamMessage) => void
    gapFound: (gap: Gap) => void
    gapResolved: () => void
    unfillableGap: (gap: Gap) => void
}

const logger = new Logger(module)

const areEqualRefs = (ref1: MessageRef, ref2: MessageRef) => {
    return ref1.compareTo(ref2) === 0
}

/*
 * This class represents a chain of messages, in which message are in ascencing order. 

 * There is always one message reference (timestamp + sequence number) to the head of the chain, 
 * and a message can be immediately added to the chain if the "prevMsgRef" of the new message is equal
 * to the head of the chain. If a message can't be immediately added to the chain, it is stored to 
 * an internal heap structure (a priority queue which is ordered my message references).
 *
 * Messages are added to the chain by calling "addMessage" method. If the new message can be immediately 
 * added to the chain, the "orderedMessageAdded" event is emitted.
 * 
 * If the new message can't be immediately added to the chain, there must be some missing messages
 * which we need before the message can be processed. In that case we emit the "gapFound" event.
 * 
 * Typically the "gapFound" triggers some component to provide us more messages (e.g. fetching
 * messages from a storage node). Also the component which produced the original message continues 
 * to provide more messages. Both of these sources provide messages by calling the "addMessage" method.
 * 
 * The sources may provide us messages which can be immediately added to the chain. In that case
 * the messages is added and the "orderedMessageAdded" event is emitted. As the head of the chain changes, 
 * there may be also some messages in the heap which can also be added now. The "orderedMessageAdded"
 * is emmitted for those messages, too. 
 * 
 * If the sources provide message which can't be immediatelly added to the chain, we store the message
 * to the internal heap structure normally, but don't emit "gapFound" event as there is already
 * an existing gap.
 *
 * It is very likely that eventually the sources will produce all the missing messages. When that happens
 * the gap is now filled and the "gapResolved" event is emitted.
 * 
 * Alternatively if don't get all the missing messages from the sources, an external component may call
 * the "resolveMessages" method. It enforces us to ignore the remaining missing messages and allows the
 * chain to proceed with new messages. In that case we iterate the internal heap and some of the messages
 * to the  chain, and typically the last of the messages resolves the gap (and therefore "gapResolved" 
 * is emitted).
 * 
 * The consequence from rules above is that we always process on gap at a time. For each "gapFound" event 
 * there is always a matching "gapResolved" event emitted before new "gapFound" event can be emitted.
 * 
 * Implementation:
 * - The "prevMessageRef" field of a message tells us whether there are missing messages between
 *   that message and some other messages. Typically all messages contain that field.
 *   If a message doesn't contain "prevMessageRef" field, we can't know if there are some missing
 *   messages, and therefore we just add that message to the chain as a latest message (if 
 *   it is newer than the current latest message).
 * - There is a check about stale messages in "addMessage". It ensures that we don't re-process 
 *   any messages which we've already processed. 
 */
export class OrderedMessageChain {
    private lastOrderedMsg?: StreamMessage
    private currentGap?: Gap
    private readonly pendingMsgs: Heap<StreamMessage>
    private readonly eventEmitter: EventEmitter<Events>
    private readonly context: OrderedMessageChainContext
    private readonly abortSignal: AbortSignal

    constructor(context: OrderedMessageChainContext, abortSignal: AbortSignal) {
        this.context = context
        this.pendingMsgs = new Heap<StreamMessage>((msg1: StreamMessage, msg2: StreamMessage) => {
            return msg1.getMessageRef().compareTo(msg2.getMessageRef())
        })
        this.eventEmitter = new EventEmitter()
        this.abortSignal = abortSignal
        abortSignal.addEventListener('abort', () => {
            this.eventEmitter.removeAllListeners()
        })
    }

    addMessage(msg: StreamMessage): void {
        if (!this.isStaleMessage(msg)) {
            this.pendingMsgs.push(msg)
            this.consumePendingOrderedMessages((msg) => this.isNextOrderedMessage(msg))
        }
    }

    resolveMessages(to: MessageRef | undefined, gapCheckEnabled: boolean): void {
        this.consumePendingOrderedMessages((msg) => {
            if (this.isNextOrderedMessage(msg)) {
                return true
            } else if (to === undefined || msg.getMessageRef().compareTo(to) <= 0) {
                const gap = {
                    from: this.lastOrderedMsg!,
                    to: msg
                }
                this.eventEmitter.emit('unfillableGap', gap)
                return true
            } else {
                return false
            }
        }, gapCheckEnabled)
    }

    async waitUntilIdle(): Promise<void> {
        const isIdle = () => this.pendingMsgs.isEmpty() || this.abortSignal.aborted
        if (!isIdle()) {
            const gate = new Gate(false)
            const listener = () => {
                if (isIdle()) {
                    gate.open()
                }
            }
            this.on('orderedMessageAdded', listener)
            this.abortSignal.addEventListener('abort', listener)
            await gate.waitUntilOpen()
            this.off('orderedMessageAdded', listener)
            this.abortSignal.removeEventListener('abort', listener)
        }
    }

    private consumePendingOrderedMessages(isConsumable: (msg: StreamMessage) => boolean, gapCheckEnabled = true) {
        while (!this.pendingMsgs.isEmpty() && isConsumable(this.pendingMsgs.peek()!)) {
            const next = this.pendingMsgs.pop()!
            this.lastOrderedMsg = next
            this.eventEmitter.emit('orderedMessageAdded', next)
            this.checkGapResolved()
        }
        if (gapCheckEnabled) {
            this.checkGapFound()
        }
    }

    private checkGapFound() {
        if (!this.pendingMsgs.isEmpty() && this.currentGap === undefined) {
            this.currentGap = {
                from: this.lastOrderedMsg!,
                to: this.pendingMsgs.peek()!
            }
            logger.debug('Gap found', {
                context: this.context,
                from: this.currentGap.from.getMessageRef(),
                to: this.currentGap.to.getMessageRef()
            })
            this.eventEmitter.emit('gapFound', this.currentGap)
        }
    }

    private checkGapResolved() {
        if (
            this.currentGap !== undefined &&
            areEqualRefs(this.lastOrderedMsg!.getMessageRef(), this.currentGap.to.getMessageRef())
        ) {
            const gap = this.currentGap
            this.currentGap = undefined
            logger.debug('Gap resolved', {
                context: this.context,
                from: gap.from.getMessageRef(),
                to: gap.to.getMessageRef()
            })
            this.eventEmitter.emit('gapResolved')
        }
    }

    private isNextOrderedMessage(msg: StreamMessage) {
        const previousRef = msg.prevMsgRef
        return (
            this.lastOrderedMsg === undefined ||
            previousRef === undefined ||
            areEqualRefs(previousRef, this.lastOrderedMsg.getMessageRef())
        )
    }

    private isStaleMessage(msg: StreamMessage): boolean {
        return (
            (this.lastOrderedMsg !== undefined &&
                msg.getMessageRef().compareTo(this.lastOrderedMsg.getMessageRef()) <= 0) ||
            this.pendingMsgs.contains(msg)
        )
    }

    getContext(): OrderedMessageChainContext {
        return this.context
    }

    on<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    once<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    off<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.off(eventName, listener as any)
    }
}
