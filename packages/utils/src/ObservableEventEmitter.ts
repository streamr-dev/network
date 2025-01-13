import EventEmitter3 from 'eventemitter3'
import { Events } from './types'

interface ObserverEvents<E extends Events<E>> {
    addEventListener: (eventName: keyof E) => void
    removeEventListener: (eventName: keyof E) => void
}

/*
 * Emits an addEventListener/removeEventListener event to a separate EventEmitter
 * whenever a listener is added or removed
 */
export class ObservableEventEmitter<E extends Events<E>> {
    private delegate: EventEmitter3<any> = new EventEmitter3()
    private observer: EventEmitter3<ObserverEvents<E>> = new EventEmitter3()

    on<T extends keyof E>(eventName: T, listener: E[T]): void {
        this.delegate.on(eventName, listener)
        this.observer.emit('addEventListener', eventName)
    }

    once<T extends keyof E>(eventName: T, listener: E[T]): void {
        const wrappedFn = (payload: Parameters<E[T]>[0]) => {
            listener(payload)
            this.observer.emit('removeEventListener', eventName)
        }
        this.delegate.once(eventName, wrappedFn)
        this.observer.emit('addEventListener', eventName)
    }

    off<T extends keyof E>(eventName: T, listener: E[T]): void {
        this.delegate.off(eventName, listener)
        this.observer.emit('removeEventListener', eventName)
    }

    removeAllListeners(): void {
        const eventNames = this.delegate.eventNames()
        this.delegate.removeAllListeners()
        for (const eventName of eventNames) {
            this.observer.emit('removeEventListener', eventName)
        }
    }

    emit<T extends keyof E>(eventName: T, payload: Parameters<E[T]>[0]): void {
        this.delegate.emit(eventName, payload)
    }

    getListenerCount<T extends keyof E>(eventName: T): number {
        return this.delegate.listenerCount(eventName)
    }

    getObserver(): EventEmitter3<ObserverEvents<E>, any> {
        return this.observer
    }
}
