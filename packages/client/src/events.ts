import EventEmitter3, { EventNames, EventListener } from 'eventemitter3'
import { StorageNodeAssignmentEvent } from './StorageNodeRegistry'

export interface StreamrClientEvents {
    addToStorageNode: (payload: StorageNodeAssignmentEvent) => void,
    removeFromStorageNode: (payload: StorageNodeAssignmentEvent) => void
}

interface ObservableEventEmitterEvents {
    addEventListener: (eventName: keyof StreamrClientEvents) => void
    removeEventListener: (eventName: keyof StreamrClientEvents) => void
}

/*
 * An observable EventEmitter: emits an addEventListener/removeEventListener event when a listener
 * is added or removed
 */
export class StreamrClientEventEmitter<C = any> extends EventEmitter3<StreamrClientEvents & ObservableEventEmitterEvents> {

    on<T extends EventNames<StreamrClientEvents & ObservableEventEmitterEvents>>(
        event: T, fn: EventListener<StreamrClientEvents & ObservableEventEmitterEvents, T>, context?: C
    ) {
        super.on(event, fn, context)
        this.emitListenerEvent('addEventListener', event)
        return this
    }

    once<T extends EventNames<StreamrClientEvents & ObservableEventEmitterEvents>>(
        event: T, fn: EventListener<StreamrClientEvents & ObservableEventEmitterEvents, T>, context?: C
    ) {
        const wrappedFn: any = (...args: any[]) => {
            (fn as any).apply(context, args)
            this.emitListenerEvent('removeEventListener', event)
        }
        super.once(event, wrappedFn, context)
        this.emitListenerEvent('addEventListener', event)
        return this
    }

    off<T extends EventNames<StreamrClientEvents & ObservableEventEmitterEvents>>(
        event: T, fn: EventListener<StreamrClientEvents & ObservableEventEmitterEvents, T>, context?: C
    ) {
        super.off(event, fn, context)
        this.emitListenerEvent('removeEventListener', event)
        return this
    }

    removeAllListeners(event?: keyof StreamrClientEvents | keyof ObservableEventEmitterEvents) {
        if (event !== undefined) {
            super.removeAllListeners(event)
            this.emitListenerEvent('removeEventListener', event)
        } else {
            // first all events which may have listeners
            for (const eventName of this.eventNames()) {
                if (!StreamrClientEventEmitter.isObserverEvent(eventName)) {
                    this.removeAllListeners(eventName)
                }
            }
            // and then possible meta events (addEventListener, removeEventListener)
            super.removeAllListeners()
        }
        return this
    }

    private emitListenerEvent(
        eventName: keyof ObservableEventEmitterEvents, sourceEvent: keyof StreamrClientEvents | keyof ObservableEventEmitterEvents
    ) {
        if (!StreamrClientEventEmitter.isObserverEvent(sourceEvent)) {
            this.emit(eventName, sourceEvent)
        }
    }

    static isObserverEvent(
        eventName: keyof StreamrClientEvents | keyof ObservableEventEmitterEvents
    ): eventName is keyof ObservableEventEmitterEvents {
        return ((eventName === 'addEventListener') || (eventName === 'removeEventListener'))
    }

}

export const initEventGateway = <L extends (...args: any[]) => void>(
    eventName: keyof StreamrClientEvents,
    start: () => L,
    stop: (listener: L) => void,
    emitter: StreamrClientEventEmitter
) => {
    let listener: L | undefined
    emitter.on('addEventListener', (sourceEvent: keyof StreamrClientEvents) => {
        if ((sourceEvent === eventName) && (listener === undefined)) {
            listener = start()
        }
    })
    emitter.on('removeEventListener', (sourceEvent: keyof StreamrClientEvents) => {
        if ((sourceEvent === eventName) && (listener !== undefined) && (emitter.listenerCount(eventName) === 0)) {
            stop(listener)
            listener = undefined
        }
    })
    if (emitter.listenerCount(eventName) > 0) {
        listener = start()
    }
}

export const EventEmitterInjectionToken = Symbol('EventEmitterInjectionToken')
