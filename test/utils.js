import { pTimeout } from '../src/utils'

const crypto = require('crypto')

const uniqueId = require('lodash.uniqueid')

export const uid = (prefix) => uniqueId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

export function fakePrivateKey() {
    return crypto.randomBytes(32).toString('hex')
}

const TEST_REPEATS = parseInt(process.env.TEST_REPEATS, 10) || 1

export function describeRepeats(msg, fn, describeFn = describe) {
    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(msg, () => {
            describeFn(`test repeat ${k + 1} of ${TEST_REPEATS}`, fn)
        })
    }
}

describeRepeats.skip = (msg, fn) => {
    describe.skip(`test repeat ALL of ${TEST_REPEATS}`, fn)
}

describeRepeats.only = (msg, fn) => {
    describeRepeats(fn, describe.only)
}

export async function collect(iterator, fn = () => {}) {
    const received = []
    for await (const msg of iterator) {
        received.push(msg.getParsedContent())
        await fn({
            msg, iterator, received,
        })
    }

    return received
}

export const Msg = (opts) => ({
    value: uid('msg'),
    ...opts,
})

export function getPublishTestMessages(client, defaultStreamId) {
    return async (n = 4, streamId = defaultStreamId) => {
        const published = []
        for (let i = 0; i < n; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop, no-loop-func
            await pTimeout(client.publish(streamId, message), 1500, `publish timeout ${streamId}: ${i} ${JSON.stringify(message)}`)
            published.push(message)
        }
        return published
    }
}
