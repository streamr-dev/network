import { EventEmitter } from 'events'

/**
 * Wait for an event to be emitted on emitter within timeout.
 *
 * @param emitter emitter of event
 * @param event event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred
 * within timeout else rejects
 */
export const waitForEvent = (emitter: EventEmitter, event: string | symbol, timeout = 5000): Promise<unknown[]> => {
    // create error beforehand to capture more usable stack
    const err = new Error(`Promise timed out after ${timeout} milliseconds`)
    return new Promise((resolve, reject) => {
        const eventListenerFn = (...args: unknown[]) => {
            clearTimeout(timeOut)
            resolve(args)
        }
        const timeOut = setTimeout(() => {
            emitter.removeListener(event, eventListenerFn)
            reject(err)
        }, timeout)
        emitter.once(event, eventListenerFn)
    })
}
