const pEvent = require('p-event')

const DEFAULT_TIMEOUT = 60000
const LOCALHOST = '127.0.0.1'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForEvent = (emitter, event, timeout = 20 * 1000) => pEvent(emitter, event, {
    timeout,
    multiArgs: true
})

const getPeers = (max) => Array.from(Array(max), (d, i) => 'address-' + i)

const eventsToArray = (emitter, events) => {
    const array = []
    events.forEach((e) => {
        emitter.on(e, (...args) => array.push([e, ...args]))
    })
    return array
}

module.exports = {
    eventsToArray,
    getPeers,
    wait,
    waitForEvent,
    DEFAULT_TIMEOUT,
    LOCALHOST,
}
