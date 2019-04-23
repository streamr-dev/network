const pEvent = require('p-event')

const LOCALHOST = '127.0.0.1'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForEvent = (emitter, event, timeout = 20 * 1000) => pEvent(emitter, event, {
    timeout,
    multiArgs: true
})

const waitForCondition = (conditionFn, timeout = 10 * 1000, retryInterval = 100) => {
    if (conditionFn()) {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const refs = {}

        refs.timeOut = setTimeout(() => {
            clearInterval(refs.interval)
            reject(new Error('waitForCondition: timed out before condition became true'))
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

const getPeers = (max) => Array.from(Array(max), (d, i) => 'address-' + i)

const eventsToArray = (emitter, events) => {
    const array = []
    events.forEach((e) => {
        emitter.on(e, () => array.push(e))
    })
    return array
}

const eventsWithArgsToArray = (emitter, events) => {
    const array = []
    events.forEach((e) => {
        emitter.on(e, (...args) => array.push([e, ...args]))
    })
    return array
}

const callbackToPromise = (method, ...args) => {
    return new Promise((resolve, reject) => {
        return method(...args, (err, result) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

module.exports = {
    callbackToPromise,
    eventsToArray,
    eventsWithArgsToArray,
    getPeers,
    wait,
    waitForEvent,
    waitForCondition,
    LOCALHOST,
}
