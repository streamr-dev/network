import EventEmitter from 'eventemitter3'

/**
 * Wait for an event to be emitted on eventemitter3 within timeout.
 *
 * @param emitter emitter of event
 * @param event event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<any[]>} resolves with event arguments if event occurred
 * within timeout else rejects
 */

export function waitForEvent3<T extends EventEmitter.ValidEventTypes>(emi: EventEmitter<T>,
    eventName: keyof T /*| EventEmitter.EventNames<T>*/, timeout = 5000): Promise<any[]> {

    return new Promise((resolve, reject) => {
        const handle = setTimeout(() => {
            reject(new Error('Timeout of ' + timeout + 'ms exceeded'))
        }, timeout)

        const lis = (...args: any[]) => {
            clearTimeout(handle)
            resolve(args)
        }

        type ListenerType = EventEmitter.EventListener<T, EventEmitter.EventNames<T>>
        type NameType = EventEmitter.EventNames<T>

        emi.once(eventName as NameType, lis as ListenerType)
    })
}

