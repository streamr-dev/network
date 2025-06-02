import { withTimeout } from './withTimeout'

/**
 * Wait for an event to be emitted on emitter within timeout.
 *
 * @param emitter emitter of event
 * @param eventName event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @param predicate function that gets passed the event arguments, should return true if event accepted
 * @param abortSignal
 * @returns {Promise<Parameters<TEvents[TEventName]>>} resolves with event arguments if event occurred within timeout else rejects
 */
export async function waitForEvent<TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    emitter: {
        on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
    },
    eventName: TEventName,
    timeout = 5000,
    predicate: (...eventArgs: Parameters<TEvents[TEventName]>) => boolean = () => true,
    abortSignal?: AbortSignal
): Promise<Parameters<TEvents[TEventName]>> {
    let listener: TEvents[TEventName]
    const task: Promise<Parameters<TEvents[TEventName]>> = new Promise((resolve) => {
        listener = ((...eventArgs: Parameters<TEvents[TEventName]>) => {
            if (predicate(...eventArgs)) {
                resolve(eventArgs)
            }
        }) as TEvents[TEventName]
        emitter.on(eventName, listener)
    })
    return withTimeout(
        task,
        timeout,
        'waitForEvent',
        abortSignal
    ).finally(() => {
        emitter.off(eventName, listener)
    })
}
