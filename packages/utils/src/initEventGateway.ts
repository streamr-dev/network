import { Events } from './types'
import { ObservableEventEmitter } from './ObservableEventEmitter'

/*
 * Initializes a gateway which can produce events to the given emitter. The gateway is running
 * when there are any listeners for the given eventName: the start() callback is called
 * when a first event listener for the event name is added, and the stop() callback is called
 * when the last event listener is removed.
 */
export const initEventGateway = <E extends Events<E>, T extends keyof E, P>(
    eventName: T,
    start: (emit: (payload: Parameters<E[T]>[0]) => void) => P,
    stop: (listener: P) => void,
    emitter: ObservableEventEmitter<E>
): void => {
    const observer = emitter.getObserver()
    const emit = (payload: Parameters<E[T]>[0]) => emitter.emit(eventName, payload)
    let producer: P | undefined
    observer.on('addEventListener', (sourceEvent: keyof E) => {
        if (sourceEvent === eventName && producer === undefined) {
            producer = start(emit)
        }
    })
    observer.on('removeEventListener', (sourceEvent: keyof E) => {
        if (sourceEvent === eventName && producer !== undefined && emitter.getListenerCount(eventName) === 0) {
            stop(producer)
            producer = undefined
        }
    })
    if (emitter.getListenerCount(eventName) > 0) {
        producer = start(emit)
    }
}
