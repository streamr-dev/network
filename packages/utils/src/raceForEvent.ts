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
    const result = await Promise.race(promises)
    raceAbortController.abort()
    await Promise.allSettled(promises)  // wait for all promises to ensure that the cleanup initiated by raceAbortController.abort() has completed
    return result
}
