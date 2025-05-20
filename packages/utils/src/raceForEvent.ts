import { waitForEvent } from './waitForEvent'

export async function raceForEvent<TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    emitter: {
        on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
    },
    eventNames: TEventName[],
    timeout: number = 5000
): Promise<{ winnerName: TEventName, winnerArgs: Parameters<TEvents[TEventName]> }> { 
    const raceAbortController = new AbortController()
    const promises = eventNames.map(async (eventName) => {
        const eventArgs = await waitForEvent(emitter, eventName, timeout, () => true, raceAbortController.signal)
        return {
            winnerName: eventName,
            winnerArgs: eventArgs
        }
    })
    let result
    try {
        result = await Promise.race(promises)
    } finally {
        // Call raceAbortController.abort() to remove the event listeners. Note that this not strictly needed when Promise.race(promises) rejects.
        // The race can reject only if withTimeout() timeouts, and as all timeouts happen at the same time, the event listeners are cleaned
        // up immediately. In that sense this could be moved out from the finally block. But it makes sense to keep it here so that the function
        // can be seen as an atomic operation: all cleanup happens _before_ the function returns, not immediately _after_ it returns.
        // The Promise.allSettled() call implements that atomicity by waiting the cleanups initiated by raceAbortController.abort() to complete.
        raceAbortController.abort()
        await Promise.allSettled(promises)
    }
    return result
}
