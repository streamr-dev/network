import { EventEmitter, once } from 'events'
import { withTimeout } from './withTimeout'

/**
 * Wait for an event to be emitted on emitter within timeout.
 *
 * @param emitter emitter of event
 * @param event event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred
 * within timeout else rejects
 */
export function waitForEvent(emitter: EventEmitter, event: string | symbol, timeout = 5000): Promise<unknown[]> {
    const abortController = new AbortController()
    return withTimeout(
        once(emitter, event, { signal: abortController.signal }),
        timeout,
        'waitForEvent'
    ).finally(() => {
        abortController.abort()
    })
}
