const { Readable } = require('stream')

const pEvent = require('p-event')

/**
 * Collect data of a stream into an array. The array is wrapped in a
 * Promise that resolves when the stream has ended, i.e., event `end` is
 * emitted by stream.
 *
 * @param {ReadableStream} stream to collect data from
 * @returns {Promise<[unknown]>} resolves with array of collected data when
 * stream ends. Rejects if stream encounters `error` event.
 */
const waitForStreamToEnd = (stream) => {
    const arr = []
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
 * @returns {Promise<unknown>} resolves with event arguments if event occurred
 * within timeout. Otherwise rejected.
 */
const waitForEvent = (emitter, event, timeout = 5000) => pEvent(emitter, event, {
    timeout,
    multiArgs: true
})

/**
 * Wait for a condition to become true by re-evaluating every `retryInterval` milliseconds.
 *
 * @param conditionFn condition to be evaluated; should return boolean and have
 * no side-effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @returns {Promise<unknown>|Promise<void>} resolves immediately if
 * conditionFn evaluates to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
const waitForCondition = (conditionFn, timeout = 5000, retryInterval = 100) => {
    if (conditionFn()) {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const refs = {}

        refs.timeOut = setTimeout(() => {
            clearInterval(refs.interval)
            reject(new Error(`waitForCondition: timed out before "${conditionFn.toString()}" became true`))
        }, timeout)

        refs.interval = setInterval(() => {
            if (conditionFn()) {
                clearTimeout(refs.timeOut)
                clearInterval(refs.interval)
                resolve()
            }
        }, retryInterval)
    })
}

/**
 * Wait for a specific time
 * @param ms time to wait for in milliseconds
 * @returns {Promise<unknown>} resolves when time has passed
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Collect events emitted by an emitter into an array.
 *
 * @param emitter emitter of event(s)
 * @param events list of event types to collect
 * @returns {[]} array that is pushed to every time emitter emits an event that
 * is defined in `events`
 */
const eventsToArray = (emitter, events) => {
    const array = []
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
 * @returns {[]} array that is pushed to every time emitter emits an event that
 * is defined in `events`, includes event arguments
 */
const eventsWithArgsToArray = (emitter, events) => {
    const array = []
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
 * @returns {Promise<unknown>} rejects with `err` if `err` is "true-ish" in cb.
 * Otherwise resolves with `res`.
 */
const callbackToPromise = (fn, ...args) => {
    return new Promise((resolve, reject) => {
        return fn(...args, (err, result) => {
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
const toReadableStream = (...args) => {
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

module.exports = {
    callbackToPromise,
    eventsToArray,
    eventsWithArgsToArray,
    toReadableStream,
    wait,
    waitForEvent,
    waitForCondition,
    waitForStreamToEnd,
}
