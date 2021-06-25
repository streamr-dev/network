import EventEmitter from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import { StreamMessage } from 'streamr-client-protocol'
/**
 * Strict types for EventEmitter interface.
 */
export type IStreamMessageEmitter = {
    end: () => void;
    message: (streamMessage: StreamMessage) => void;
    error: (error: Error) => void;
}

const StreamMessageEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, IStreamMessageEmitter> }

export type { EventEmitter }

export default StreamMessageEmitter
