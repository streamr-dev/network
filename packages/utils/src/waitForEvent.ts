import { EventEmitter } from 'events'
import { withTimeout } from './withTimeout'

/**
 * Wait for an event to be emitted on emitter within timeout.
 *
 * @param emitter emitter of event
 * @param eventName event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @param predicate function that gets passed the event arguments, should return true if event accepted
 * @param abortSignal
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred within timeout else rejects
 */
export async function waitForEvent(
    emitter: EventEmitter,
    eventName: string,
    timeout = 5000,
    predicate: (...eventArgs: any[]) => boolean = () => true,
    abortSignal?: AbortSignal
): Promise<unknown[]> {
    let listener: (eventArgs: any[]) => void
    const task: Promise<unknown[]> = new Promise((resolve) => {
        listener = (...eventArgs: any[]) => {
            if (predicate(...eventArgs)) {
                resolve(eventArgs)
            }
        }
        emitter.on(eventName, listener)
    })
    return withTimeout(task, timeout, 'waitForEvent', abortSignal).finally(() => {
        emitter.off(eventName, listener)
    })
}
