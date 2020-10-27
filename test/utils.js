import { wait } from 'streamr-test-utils'

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
    describeRepeats(msg, fn, describe.only)
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

export function getWaitForStorage(client) {
    /* eslint-disable no-await-in-loop */
    return async ({
        streamId,
        streamPartition = 0,
        msg,
        interval = 500,
        timeout = 5000,
    }) => {
        const start = Date.now()
        let last
        // eslint-disable-next-line no-constant-condition
        let found = false
        while (!found) {
            const duration = Date.now() - start
            if (duration > timeout) {
                client.debug('waitForStorage timeout %o', {
                    timeout,
                    duration
                }, {
                    msg,
                    last: last.map((l) => l.content),
                })
                const err = new Error(`timed out after ${duration}ms waiting for message`)
                err.msg = msg
                throw err
            }

            last = await client.getStreamLast({
                streamId,
                streamPartition,
                count: 3,
            })

            for (const { content } of last) {
                if (content.value === msg.value) {
                    found = true
                    return
                }
            }

            client.debug('message not found, retrying... %o', {
                msg, last: last.map(({ content }) => content)
            })

            await wait(interval)
        }
    }
    /* eslint-enable no-await-in-loop */
}
