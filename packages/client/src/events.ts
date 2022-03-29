import { Lifecycle, scoped } from 'tsyringe'
import EventEmitter3 from 'eventemitter3'
import { StorageNodeAssignmentEvent } from './StorageNodeRegistry'

export interface StreamrClientEvents {
    addToStorageNode: (payload: StorageNodeAssignmentEvent) => void,
    removeFromStorageNode: (payload: StorageNodeAssignmentEvent) => void
}

interface ObserverEvents<E extends object> {
    addEventListener: (eventName: keyof E) => void
    removeEventListener: (eventName: keyof E) => void
}

/*
 * Emits an addEventListener/removeEventListener event to a separate EventEmitter
 * whenever a listener is added or removed
 */
export class ObservableEventEmitter<E extends object> {

    private delegate: EventEmitter3<E> = new EventEmitter3()
    private observer: EventEmitter3<ObserverEvents<E>> = new EventEmitter3()

    on<T extends keyof E>(eventName: T, listener: E[T]) {
        this.delegate.on(eventName as any, listener as any)
        this.observer.emit('addEventListener', eventName)
    }

    once<T extends keyof E>(eventName: T, listener: E[T]) {
        const wrappedFn = (payload: any) => {
            (listener as any)(payload)
            this.observer.emit('removeEventListener', eventName)
        }
        this.delegate.once(eventName as any, wrappedFn as any)
        this.observer.emit('addEventListener', eventName)
    }

    off<T extends keyof E>(eventName: T, listener: E[T]) {
        this.delegate.off(eventName as any, listener as any)
        this.observer.emit('removeEventListener', eventName)
    }

    removeAllListeners() {
        const eventNames = this.delegate.eventNames()
        this.delegate.removeAllListeners()
        for (const eventName of eventNames) {
            this.observer.emit('removeEventListener', eventName)
        }
    }

    emit<T extends keyof E>(eventName: T, payload: any) {
        (this.delegate.emit as any)(eventName, payload)
    }

    getListenerCount<T extends keyof E>(eventName: T) {
        return this.delegate.listenerCount(eventName as any)
    }

    getObserver() {
        return this.observer
    }
}

export const initEventGateway = <E extends object, L extends (...args: any[]) => void>(
    eventName: keyof StreamrClientEvents,
    start: () => L,
    stop: (listener: L) => void,
    emitter: ObservableEventEmitter<E>
) => {
    const observer = emitter.getObserver()
    let listener: L | undefined
    observer.on('addEventListener', (sourceEvent: keyof E) => {
        if ((sourceEvent === eventName) && (listener === undefined)) {
            listener = start()
        }
    })
    observer.on('removeEventListener', (sourceEvent: keyof E) => {
        if ((sourceEvent === eventName) && (listener !== undefined) && (emitter.getListenerCount(eventName as any) === 0)) {
            stop(listener)
            listener = undefined
        }
    })
    if (emitter.getListenerCount(eventName as any) > 0) {
        listener = start()
    }
}

@scoped(Lifecycle.ContainerScoped)
export class StreamrClientEventEmitter extends ObservableEventEmitter<StreamrClientEvents> {
}
