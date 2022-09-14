import { EventEmitter } from 'events'
import { withTimeout } from './withTimeout'

/**
 * Wait for an event to be emitted on emitter within timeout.
 *
 * @param emitter emitter of event
 * @param eventName event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @param predicate function that gets passed the event arguments, should return true if event accepted
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred within timeout else rejects
 */
export async function waitForEvent(
    emitter: EventEmitter,
    eventName: string,
    timeout = 5000,
    predicate: (eventArgs: unknown[]) => boolean = () => true
): Promise<unknown[]> {
    let listener: (eventArgs: unknown[]) => void
    // eslint-disable-next-line no-async-promise-executor
    const task: Promise<unknown[]> = new Promise(async (resolve) => {
        listener = (...eventArgs: unknown[]) => {
            if (predicate(eventArgs)) {
                resolve(eventArgs)
            }
        }
        emitter.on(eventName, listener)
    })
    return withTimeout(
        task,
        timeout,
        'waitForEvent'
    ).finally(() => {
        emitter.off(eventName, listener)
    })
}
