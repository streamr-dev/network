import { inspect } from 'util'

import { wait } from 'streamr-test-utils'

import { pTimeout, counterId } from '../src/utils'
import { validateOptions } from '../src/stream/utils'

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

function defaultMessageMatchFn(msgTarget, msgGot) {
    if (msgTarget.streamMessage.signature) {
        // compare signatures by default
        return msgTarget.streamMessage.signature === msgGot.signature
    }
    return JSON.stringify(msgGot.content) === JSON.stringify(msgTarget.streamMessage.getParsedContent())
}

export function getWaitForStorage(client, defaultOpts = {}) {
    /* eslint-disable no-await-in-loop */
    return async (publishRequest, opts = {}) => {
        const {
            streamId, streamPartition = 0, interval = 500, timeout = 5000, messageMatchFn = defaultMessageMatchFn
        } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

        if (!publishRequest && !publishRequest.streamMessage) {
            throw new Error(`should check against publish request for comparison, got: ${inspect(publishRequest)}`)
        }

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
                    publishRequest,
                    last: last.map((l) => l.content),
                })
                const err = new Error(`timed out after ${duration}ms waiting for message`)
                err.publishRequest = publishRequest
                throw err
            }

            last = await client.getStreamLast({
                streamId,
                streamPartition,
                count: 3,
            })

            for (const lastMsg of last) {
                if (messageMatchFn(publishRequest, lastMsg)) {
                    found = true
                    return
                }
            }

            client.debug('message not found, retrying... %o', {
                msg: publishRequest.streamMessage.getParsedContent(),
                last: last.map(({ content }) => content)
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
            timeout = 3500,
            waitForLast = false, // wait for message to hit storage
            waitForLastTimeout,
            beforeEach = (m) => m,
            afterEach = () => {}
        } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

        const published = []
        for (let i = 0; i < n; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop, no-loop-func
            await beforeEach(message)
            // eslint-disable-next-line no-await-in-loop, no-loop-func
            const request = await pTimeout(client.publish({
                streamId,
                streamPartition,
            }, message), timeout, `publish timeout ${streamId}: ${i} ${inspect(message)}`)
            published.push([
                message,
                request,
            ])

            // eslint-disable-next-line no-await-in-loop, no-loop-func
            await afterEach(message, request)
            // eslint-disable-next-line no-await-in-loop, no-loop-func
            await wait(delay) // ensure timestamp increments for reliable resend response in test.
        }

        if (waitForLast) {
            const msg = published[published.length - 1][1]
            await getWaitForStorage(client)(msg, {
                streamId,
                streamPartition,
                timeout: waitForLastTimeout,
                messageMatchFn(m, b) {
                    return m.streamMessage.signature === b.signature
                }
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
