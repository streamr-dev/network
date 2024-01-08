import EventEmitter from 'eventemitter3'

// TODO we may want to export all used types (Events, EventEmitter.*)

type Events<T> = { [K in keyof T]: (...payloads: any[]) => void }

export const addManagedEventListener = <E extends Events<E>, T extends EventEmitter.EventNames<E>>(
    emitter: Pick<EventEmitter<E>, 'on' | 'off'>,
    eventName: T,
    listener: EventEmitter.EventListener<E, T>,
    abortSignal: AbortSignal
): void => {
    if (!abortSignal.aborted) {
        emitter.on(eventName, listener)
        abortSignal.addEventListener('abort', () => {
            emitter.off(eventName, listener)
        }, { 
            once: true
        })
    }
}
