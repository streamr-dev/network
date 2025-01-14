import { withTimeout } from './withTimeout'
import { Logger } from './Logger'
import EventEmitter from 'eventemitter3'

const logger = new Logger(module)

const once = <T extends EventEmitter.ValidEventTypes>(
    emitter: EventEmitter<T>,
    eventName: keyof T,
    predicate: (...eventArgs: any[]) => boolean = () => true
): { task: Promise<any[]>; cancel: () => void } => {
    let listener: (eventArgs: any[]) => void
    const task = new Promise<any[]>((resolve) => {
        listener = (...eventArgs: any[]) => {
            if (predicate(...eventArgs)) {
                resolve(eventArgs)
            }
        }
        emitter.on(eventName as any, listener as any)
    })
    const cancel = () => emitter.off(eventName as any, listener as any)
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
    timeout = 5000,
    predicate: (...eventArgs: any[]) => boolean = () => true
): Promise<unknown> {
    const { task, cancel } = once(emitter, eventName, predicate)
    return withTimeout(task, timeout, 'waitForEvent3').finally(() => {
        cancel()
    })
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type RunAndRaceEventsReturnType<T extends EventEmitter.ValidEventTypes> = {
    winnerName: keyof T
    winnerArgs: any[]
}

/**
 * Wait for an event to be emitted on eventemitter3 within timeout.
 *
 * @param emitter emitter of event
 * @param eventNames events to race
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<{eventName: keyof T, eventArgs: any[]}>} resolves with the winning events name and arguments if event occurred
 * within timeout else rejects
 */

export function raceEvents3<T extends EventEmitter.ValidEventTypes>(
    emitter: EventEmitter<T>,
    eventNames: (keyof T)[],
    timeout: number | null = 5000
): Promise<RunAndRaceEventsReturnType<T>> {
    const promises: { task: Promise<RunAndRaceEventsReturnType<T>>; cancel: () => void }[] = []
    eventNames.forEach((eventName) => {
        const item = once(emitter, eventName)
        const wrappedTask = item.task.then((value: any[]) => {
            const ret: RunAndRaceEventsReturnType<T> = { winnerName: eventName, winnerArgs: value }
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
        return withTimeout(Promise.race(promises.map((promise) => promise.task)), timeout, 'raceEvents3').finally(
            () => {
                cancelAll()
            }
        )
    } else {
        return Promise.race(promises.map((promise) => promise.task)).finally(() => {
            cancelAll()
        })
    }
}

export function runAndRaceEvents3<T extends EventEmitter.ValidEventTypes>(
    operations: (() => void)[],
    emitter: EventEmitter<T>,
    eventNames: (keyof T)[],
    timeout: number
): Promise<RunAndRaceEventsReturnType<T>> {
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
const runAndWait = async <T extends EventEmitter.ValidEventTypes>(
    operations: (() => void)[],
    waitedEvents: [emitter: EventEmitter<T>, event: keyof T][],
    timeout: number,
    promiseFn: (args: Promise<unknown>[]) => Promise<unknown[]>
): Promise<unknown[]> => {
    const promise = promiseFn(waitedEvents.map(([emitter, event]) => waitForEvent3(emitter, event, timeout)))
    operations.forEach((op) => {
        op()
    })
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
export const runAndWaitForEvents3 = async <T extends EventEmitter.ValidEventTypes>(
    operations: (() => void)[],
    waitedEvents: [emitter: EventEmitter<T>, event: keyof T][],
    timeout = 5000
): Promise<unknown[]> => {
    return runAndWait(operations, waitedEvents, timeout, Promise.all.bind(Promise))
}
