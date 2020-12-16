import { inspect } from 'util'

import { validateOptions } from '../stream/utils'

import { pTimeout, counterId } from './index'

const crypto = require('crypto')

export const uid = (prefix) => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function fakePrivateKey() {
    return crypto.randomBytes(32).toString('hex')
}

export const Msg = (opts) => ({
    value: uid('msg'),
    ...opts,
})

function defaultMessageMatchFn(msgTarget, msgGot) {
    return msgGot.value === msgTarget.value
}

export function getWaitForStorage(client, defaultOpts = {}) {
    /* eslint-disable no-await-in-loop */
    return async (msg, opts = {}) => {
        const {
            streamId, streamPartition = 0, interval = 500, timeout = 5000, messageMatchFn = defaultMessageMatchFn
        } = validateOptions({
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

            for (const lastMsg of last) {
                if (messageMatchFn(msg, lastMsg)) {
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
