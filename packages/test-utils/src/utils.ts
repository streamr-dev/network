import { Readable } from "stream"
import { EventEmitter } from "events"
import { AssertionError } from "assert"

export type Event = string | symbol

/**
 * Collect data of a stream into an array. The array is wrapped in a
 * Promise that resolves when the stream has ended, i.e., event `end` is
 * emitted by stream.
 *
 * @param {ReadableStream} stream to collect data from
 * @returns {Promise<unknown[]>} resolves with array of collected data when
 * stream ends. Rejects if stream encounters `error` event.
 */
export const waitForStreamToEnd = (stream: Readable): Promise<unknown[]> => {
    const arr: unknown[] = []
    return new Promise((resolve, reject) => {
        stream
            .on('data', arr.push.bind(arr))
            .on('error', reject)
            .on('end', () => resolve(arr))
    })
}

/**
 * Wait for an event to be emitted on emitter within timeout.
 *
 * @param emitter emitter of event
 * @param event event to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred
 * within timeout. Otherwise rejected.
 */
export const waitForEvent = (emitter: EventEmitter, event: Event, timeout = 5000): Promise<unknown[]> => {
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
export const runAndWaitForEvents = (operations: Function | Function[], waitedEvents: [emitter: EventEmitter, event: Event] | Array<[emitter: EventEmitter, event: Event]>, timeout = 5000): Promise<unknown[]> => {
    let ops: Function[]
    if (Array.isArray(operations)) {
        ops = operations
    } 
    else {
        ops = [operations]
    }

    let evs: Array<[emitter: EventEmitter, event: Event]>
    if (Array.isArray(waitedEvents) && Array.isArray(waitedEvents[0]) ) {
        evs = waitedEvents as Array<[emitter: EventEmitter, event: Event]>
    } 
    else {
        evs = [waitedEvents as [emitter: EventEmitter, event: Event]]
    }
    
    const promise: Promise<unknown[]> = new Promise( (resolve, reject) => { 
        Promise.all(evs.map(e => { waitForEvent(e[0], e[1], timeout) }))
        .then((result) => {
            resolve(result)
        })
        .catch( (e) => {
            reject(e)
        })
    })

    ops.forEach(op=> { op() })
    
    return promise
}

/**
 * Wait for a condition to become true by re-evaluating every `retryInterval` milliseconds.
 *
 * @param conditionFn condition to be evaluated; should return boolean or Promise<boolean> and have
 * no side-effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @param onTimeoutContext evaluated only on timeout. Used to associate human-friendly textual context to error.
 * @returns {Promise<void>} resolves immediately if
 * conditionFn evaluates to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
export const waitForCondition = async (
    conditionFn: () => (boolean | Promise<boolean>),
    timeout = 5000,
    retryInterval = 100,
    onTimeoutContext?: () => string
): Promise<void> => {
    // create error beforehand to capture more usable stack
    const err = new Error(`waitForCondition: timed out before "${conditionFn.toString()}" became true`)
    return new Promise((resolve, reject) => {
        let poller: NodeJS.Timeout | undefined = undefined
        const clearPoller = () => {
            if (poller !== undefined) {
                clearInterval(poller)
            }
        }
        const maxTime = Date.now() + timeout
        const poll = async () => {
            if (Date.now() < maxTime) {
                let result
                try {
                    result = await conditionFn()
                } catch (err) {
                    clearPoller()
                    reject(err)
                }
                if (result) {
                    clearPoller()
                    resolve()
                }
            } else {
                clearPoller()
                if (onTimeoutContext) {
                    err.message += `\n${onTimeoutContext()}`
                }
                reject(err)
            }
        }
        setImmediate(poll)
        poller = setInterval(poll, retryInterval)
    })
}

/**
 * Run functions and wait conditions to become true by re-evaluating every `retryInterval` milliseconds. Returns a promise created with Promise.all() 
 * and waitForCondition() calls. Calls the functions after creating the promise.
 * 
 * @param operations function(s) to call
 * @param conditions condition(s) to be evaluated; condition functions should return boolean or Promise<boolean> and have
 * no side-effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @param onTimeoutContext evaluated only on timeout. Used to associate human-friendly textual context to error.
 * @returns {Promise<unknown[]>} resolves immediately if
 * conditions evaluate to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
export const runAndWaitForConditions = (
    operations: Function | Function[], 
    conditions: (() => (boolean | Promise<boolean>)) | (() => (boolean | Promise<boolean>)) [],
    timeout = 5000,
    retryInterval = 100,
    onTimeoutContext?: () => string
    ): Promise<unknown[]> => {

    let ops: Function[]
    if (Array.isArray(operations)) {
        ops = operations
    } 
    else {
        ops = [operations];
    }
    
    let conds: (() => (boolean | Promise<boolean>)) [] 
    if (Array.isArray(conditions)) {
        conds = conditions
    } 
    else {
        conds = [conditions];
    }
    
    
    const promise: Promise<unknown[]> = new Promise( (resolve, reject) => { 
        Promise.all(conds.map(c => { waitForCondition(c, timeout, retryInterval, onTimeoutContext) }))
        .then((result) => {
            resolve(result)
        })
        .catch( (e) => {
            reject(e)
        })
    })

    ops.forEach(op=> { op() })
    
    return promise
}

/**
 * Wait for a specific time
 * @param ms time to wait for in milliseconds
 * @returns {Promise<void>} resolves when time has passed
 */
export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Collect events emitted by an emitter into an array.
 *
 * @param emitter emitter of event(s)
 * @param events list of event types to collect
 * @returns {Array<Event>} array that is pushed to every time emitter emits an event that
 * is defined in `events`
 */
export const eventsToArray = (emitter: EventEmitter, events: ReadonlyArray<Event>): Event[] => {
    const array: Array<Event> = []
    events.forEach((e) => {
        emitter.on(e, () => array.push(e))
    })
    return array
}

/**
 * Collect events emitted by an emitter into an array, including event arguments.
 *
 * @param emitter emitter of event(s)
 * @param events list of event types to collect
 * @returns {Array<[Event, ...any]>} array that is pushed to every time emitter emits an event that
 * is defined in `events`, includes event arguments
 */
export const eventsWithArgsToArray = (emitter: EventEmitter, events: ReadonlyArray<Event>): Array<[Event, ...any]> => {
    const array: Array<[Event, ...any]> = []
    events.forEach((e) => {
        emitter.on(e, (...args) => array.push([e, ...args]))
    })
    return array
}

/**
 * Convert a function that has as its last argument a callback of the form
 * (err, result) into a Promise.
 *
 * @param fn should be of format (arg1, arg2, ..., argN, (err, res) => {...})
 * @param args arguments to be passed into fn (before callback)
 * @returns {Promise<T>} rejects with `err` if `err` is "true-ish" in cb.
 * Otherwise resolves with `res`.
 */
export const callbackToPromise = <T>(fn: (...innerArgs: any[]) => any, ...args: unknown[]): Promise<T> => {
    return new Promise((resolve, reject) => {
        return fn(...args, (err: Error, result: T) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

/**
 * Create a {ReadableStream} out of an array of items. Any {Error} items will
 * be emitted as error events instead of pushed to stream.
 * @param args an array of items
 * @returns {ReadableStream}
 */
export const toReadableStream = (...args: unknown[]): Readable => {
    const messagesOrErrors = [...args]
    const rs = new Readable({
        objectMode: true,
        read: () => {
            const item = messagesOrErrors.shift()
            if (item == null) {
                rs.push(null) // end-of-stream
            } else if (item instanceof Error) {
                rs.emit('error', item)
            } else {
                rs.push(item)
            }
        }
    })
    return rs
}
