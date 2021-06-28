import EventEmitter from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import { StreamMessage } from 'streamr-client-protocol'
/**
 * Strict types for EventEmitter interface.
 */

type IStreamMessageEmitterBase = {
    end: () => void
    message: (streamMessage: StreamMessage) => void
    error: (error: Error) => void
}

export interface IStreamMessageEmitter extends IStreamMessageEmitterBase {
    newListener<E extends keyof IStreamMessageEmitterBase> (event: E, ...args: any[]): this
}

const StreamMessageEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, IStreamMessageEmitter> }

export type { EventEmitter }

export default StreamMessageEmitter
