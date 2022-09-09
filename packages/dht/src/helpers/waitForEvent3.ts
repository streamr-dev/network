import { withTimeout } from '@streamr/utils'
import EventEmitter from 'eventemitter3'

const once = <T extends EventEmitter.ValidEventTypes>(
    emitter: EventEmitter<T>,
    eventName: keyof T
): { task: Promise<unknown>, cancel: () => void } => {
    let listener: any
    const task = new Promise((resolve) => {
        listener = (...args: any) => {
            resolve(args)
        }
        emitter.once(eventName as any, listener)
    })
    const cancel = () => emitter.off(eventName as any, listener)
    return {
        task,
        cancel
    }
}

/**
 * Wait for an event to be emitted on eventemitter3 within timeout.
 *
 * @param emitter emitter of event
 * @param event event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<any[]>} resolves with event arguments if event occurred
 * within timeout else rejects
 */

export function waitForEvent3<T extends EventEmitter.ValidEventTypes>(
    emitter: EventEmitter<T>,
    eventName: keyof T,
    timeout = 5000
): Promise<unknown> {
    const { task, cancel } = once(emitter, eventName)
    return withTimeout(
        task,
        timeout,
        'waitForEvent'
    ).finally(() => {
        cancel()
    })
}

// internal
const runAndWait = async <T extends EventEmitter.ValidEventTypes>(
    operations: (() => void)[],
    waitedEvents: [emitter: EventEmitter<T>, event: keyof T][],
    timeout: number,
    promiseFn: (args: Array<Promise<unknown>>) => Promise<unknown[]>
): Promise<unknown[]> => {
    const promise = promiseFn(waitedEvents.map(([emitter, event]) => waitForEvent3(emitter, event, timeout)))
    operations.forEach((op) => { op() })
    return promise
}

/**
 * Run functions and wait for events to be emitted within timeout. Returns a promise created with Promise.all() 
 * and waitForEvent() calls. Calls the functions after creating the promise.
 *
 * @param operations function(s) to call
 * @param waitedEvents event(s) to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred
 * within timeout. Otherwise rejected.
 */
export const runAndWaitForEvents = async <T extends EventEmitter.ValidEventTypes>(
    operations: (() => void)[], 
    waitedEvents: [emitter: EventEmitter<T>, event: keyof T][],
    timeout = 5000
): Promise<unknown[]> => {
    return runAndWait(operations, waitedEvents, timeout, Promise.all.bind(Promise))
}
