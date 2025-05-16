import { withTimeout } from './withTimeout'
import { Logger } from './Logger'
import { waitForEvent } from './waitForEvent'

const logger = new Logger(module)

const once = <TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    emitter: {
        on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
    },
    eventName: TEventName,
    predicate: (...eventArgs: any[]) => boolean = () => true,
): { task: Promise<any[]>, cancel: () => void } => {
    let listener: TEvents[TEventName]
    const task: Promise<Parameters<TEvents[TEventName]>> = new Promise((resolve) => {
        listener = ((...eventArgs: Parameters<TEvents[TEventName]>) => {
            if (predicate(...eventArgs)) {
                resolve(eventArgs)
            }
        }) as TEvents[TEventName]
        emitter.on(eventName as any, listener as any)
    })
    const cancel = () => emitter.off(eventName as any, listener as any)
    return {
        task,
        cancel
    }
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type RunAndRaceEventsReturnType<TEvents 
    extends Record<string, (...args: Parameters<TEvents[TEventName]>) => void>, TEventName extends keyof TEvents>
    = { winnerName: TEventName, winnerArgs: any[] }

/**
 * Wait for an event to be emitted on eventemitter3 within timeout.
 *
 * @param emitter emitter of event
 * @param eventNames events to race
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<{eventName: keyof T, eventArgs: any[]}>} resolves with the winning events name and arguments if event occurred
 * within timeout else rejects
 */

export function raceEvents3<TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    emitter: {
        on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
    },
    eventNames: TEventName[],
    timeout: number | null = 5000
): Promise<RunAndRaceEventsReturnType<TEvents, TEventName>> {
    const promises: { task: Promise<RunAndRaceEventsReturnType<TEvents, TEventName>>, cancel: () => void }[] = []
    eventNames.forEach((eventName) => {
        const item = once(emitter, eventName)
        const wrappedTask = item.task.then((value: any[]) => {
            const ret: RunAndRaceEventsReturnType<TEvents, TEventName> = { winnerName: eventName, winnerArgs: value }
            return ret
        })
        promises.push({ task: wrappedTask, cancel: item.cancel })
    })

    const cancelAll = () => {
        promises.forEach((promise) => {
            promise.cancel()
        })
    }

    if (timeout !== null) {
        return withTimeout(
            Promise.race(promises.map((promise) => promise.task)),
            timeout,
            'raceEvents3'
        ).finally(() => {
            cancelAll()
        })
    } else {
        return Promise.race(promises.map((promise) => promise.task)).finally(() => {
            cancelAll()
        })
    }

}

export function runAndRaceEvents3<TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    operations: (() => void)[],
    emitter: {
        on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
    },
    eventNames: TEventName[],
    timeout: number
): Promise<RunAndRaceEventsReturnType<TEvents, TEventName>> {
    const promise = raceEvents3(emitter, eventNames, timeout)
    operations.forEach((op) => {
        try {
            op()
        } catch (e) {
            logger.error('runAndRaceEvents3 caught exception ' + e)
        }
    })
    return promise
}

// internal
const runAndWait = async <TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    operations: (() => void)[],
    waitedEvents: [
        emitter: {
            on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
            off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        },
        eventName: TEventName
    ][],
    timeout: number,
    promiseFn: (args: Promise<unknown>[]) => Promise<unknown[]>
): Promise<unknown[]> => {
    const promise = promiseFn(waitedEvents.map(([emitter, event]) => waitForEvent(emitter, event, timeout)))
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
export const runAndWaitForEvents3 = async <TEvents extends Record<string, (...args: any[]) => void>, TEventName extends keyof TEvents>(
    operations: (() => void)[],
    waitedEvents: [
        emitter: {
            on: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
            off: (eventName: TEventName, listener: TEvents[TEventName]) => unknown
        },
        eventName: TEventName
    ][],
    timeout = 5000
): Promise<unknown[]> => {
    return runAndWait(operations, waitedEvents, timeout, Promise.all.bind(Promise))
}
