import { wait } from 'streamr-test-utils'

import { pTimeout, counterId } from '../src/utils'
import { validateOptions } from '../src/subscribe'

const crypto = require('crypto')

export const uid = (prefix) => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

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

export function getWaitForStorage(client, defaultOpts = {}) {
    /* eslint-disable no-await-in-loop */
    return async (msg, opts = {}) => {
        const { streamId, streamPartition = 0, interval = 500, timeout = 5000 } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

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

export function getPublishTestMessages(client, defaultOpts = {}) {
    // second argument could also be streamId
    if (typeof defaultOpts === 'string') {
        // eslint-disable-next-line no-param-reassign
        defaultOpts = {
            streamId: defaultOpts,
        }
    }

    const publishTestMessagesRaw = async (n = 4, opts = {}) => {
        const {
            streamId,
            streamPartition = 0,
            delay = 100,
            timeout = 1500,
            waitForLast = false, // wait for message to hit storage
            waitForLastTimeout,
        } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

        const published = []
        for (let i = 0; i < n; i++) {
            const message = Msg()
            published.push([
                message,
                // eslint-disable-next-line no-await-in-loop, no-loop-func
                await pTimeout(client.publish({
                    streamId,
                    streamPartition,
                }, message), timeout, `publish timeout ${streamId}: ${i} ${JSON.stringify(message)}`)
            ])
            // eslint-disable-next-line no-await-in-loop, no-loop-func
            await wait(delay) // ensure timestamp increments for reliable resend response in test.
        }

        if (waitForLast) {
            const msg = published[published.length - 1][0]
            await getWaitForStorage(client)(msg, {
                streamId,
                streamPartition,
                timeout: waitForLastTimeout,
            })
        }

        return published
    }

    const publishTestMessages = async (...args) => {
        const published = await publishTestMessagesRaw(...args)
        return published.map(([msg]) => msg)
    }

    publishTestMessages.raw = publishTestMessagesRaw
    return publishTestMessages
}
