import { inspect } from 'util'
import { wait } from 'streamr-test-utils'
import { providers, Wallet } from 'ethers'
import { pTimeout, counterId, AggregatedError } from '../src/utils'
import { validateOptions } from '../src/stream/utils'
import { StreamrClient } from '../src/StreamrClient'

const crypto = require('crypto')
const config = require('./integration/config')

export const uid = (prefix?: string) => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

export function fakePrivateKey() {
    return crypto.randomBytes(32).toString('hex')
}

const TEST_REPEATS = (process.env.TEST_REPEATS) ? parseInt(process.env.TEST_REPEATS, 10) : 1

export function describeRepeats(msg: any, fn: any, describeFn = describe) {
    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(msg, () => {
            describeFn(`test repeat ${k + 1} of ${TEST_REPEATS}`, fn)
        })
    }
}

describeRepeats.skip = (msg: any, fn: any) => {
    describe.skip(`${msg} – test repeat ALL of ${TEST_REPEATS}`, fn)
}

describeRepeats.only = (msg: any, fn: any) => {
    describeRepeats(msg, fn, describe.only)
}

export async function collect(iterator: any, fn: (item: any) => void = async () => {}) {
    const received: any[] = []
    for await (const msg of iterator) {
        received.push(msg.getParsedContent())
        await fn({
            msg, iterator, received,
        })
    }

    return received
}

export function addAfterFn() {
    const afterFns: any[] = []
    afterEach(async () => {
        const fns = afterFns.slice()
        afterFns.length = 0
        // @ts-expect-error
        AggregatedError.throwAllSettled(await Promise.allSettled(fns.map((fn) => fn())))
    })

    return (fn: any) => {
        afterFns.push(fn)
    }
}

export const Msg = (opts: any) => ({
    value: uid('msg'),
    ...opts,
})

function defaultMessageMatchFn(msgTarget: any, msgGot: any) {
    if (msgTarget.streamMessage.signature) {
        // compare signatures by default
        return msgTarget.streamMessage.signature === msgGot.signature
    }
    return JSON.stringify(msgGot.content) === JSON.stringify(msgTarget.streamMessage.getParsedContent())
}

export function getWaitForStorage(client: StreamrClient, defaultOpts = {}) {
    /* eslint-disable no-await-in-loop */
    return async (publishRequest: any, opts = {}) => {
        const {
            streamId, streamPartition = 0, interval = 500, timeout = 5000, count = 100, messageMatchFn = defaultMessageMatchFn
        } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

        if (!publishRequest && !publishRequest.streamMessage) {
            throw new Error(`should check against publish request for comparison, got: ${inspect(publishRequest)}`)
        }

        const start = Date.now()
        let last: any
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
                    last: last!.map((l: any) => l.content),
                })
                const err: any = new Error(`timed out after ${duration}ms waiting for message`)
                err.publishRequest = publishRequest
                throw err
            }

            last = await client.getStreamLast({
                // @ts-expect-error
                streamId,
                streamPartition,
                count,
            })

            for (const lastMsg of last) {
                if (messageMatchFn(publishRequest, lastMsg)) {
                    found = true
                    return
                }
            }

            client.debug('message not found, retrying... %o', {
                msg: publishRequest.streamMessage.getParsedContent(),
                last: last.map(({ content }: any) => content)
            })

            await wait(interval)
        }
    }
    /* eslint-enable no-await-in-loop */
}

export function getPublishTestMessages(client: StreamrClient, defaultOpts = {}) {
    // second argument could also be streamId
    if (typeof defaultOpts === 'string') {
        // eslint-disable-next-line no-param-reassign
        defaultOpts = {
            streamId: defaultOpts,
        }
    }

    const publishTestMessagesRaw = async (n = 4, opts = {}) => {
        const id = uid('test')
        let msgCount = 0
        const {
            streamId,
            streamPartition = 0,
            delay = 100,
            timeout = 3500,
            waitForLast = false, // wait for message to hit storage
            waitForLastCount,
            waitForLastTimeout,
            beforeEach = (m: any) => m,
            afterEach = () => {},
            timestamp,
            partitionKey,
            createMessage = () => {
                msgCount += 1
                return {
                    test: id,
                    value: `${msgCount} of ${n}`
                }
            },
        } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

        let connectionDone = false
        function checkDone() {
            if (connectionDone) {
                throw new Error('Connection done before finished publishing')
            }
        }
        const onDone = () => {
            connectionDone = true
        }
        try {
            client.connection.once('done', onDone)

            const published = []
            /* eslint-disable no-await-in-loop, no-loop-func */
            for (let i = 0; i < n; i++) {
                checkDone()
                const message = createMessage()
                await beforeEach(message)
                checkDone()
                const request = await pTimeout(client.publish(
                    { streamId, streamPartition },
                    message,
                    typeof timestamp === 'function' ? timestamp() : timestamp,
                    partitionKey
                ), timeout, `publish timeout ${streamId}: ${i} ${inspect(message)}`)
                checkDone()
                published.push([
                    message,
                    request,
                ])

                await afterEach(message, request)
                checkDone()
                await wait(delay) // ensure timestamp increments for reliable resend response in test.
                checkDone()
            }
            /* eslint-enable no-await-in-loop, no-loop-func */

            checkDone()

            if (waitForLast) {
                const msg = published[published.length - 1][1]
                await getWaitForStorage(client)(msg, {
                    streamId,
                    streamPartition,
                    timeout: waitForLastTimeout,
                    count: waitForLastCount,
                    messageMatchFn(m: any, b: any) {
                        checkDone()
                        return m.streamMessage.signature === b.signature
                    }
                })
            }

            return published
        } finally {
            client.connection.off('done', onDone)
        }
    }

    const publishTestMessages = async (...args: any[]) => {
        const published = await publishTestMessagesRaw(...args)
        return published.map(([msg]) => msg)
    }

    publishTestMessages.raw = publishTestMessagesRaw
    return publishTestMessages
}

export const createMockAddress = () => '0x000000000000000000000000000' + Date.now()

export const createClient = (providerSidechain?: providers.JsonRpcProvider) => {
    const wallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`, providerSidechain)
    return new StreamrClient({
        ...config.clientOptions,
        auth: {
            privateKey: wallet.privateKey
        }
    })
}

export const expectInvalidAddress = (operation: () => Promise<any>) => {
    return expect(() => operation()).rejects.toThrow('invalid address')
}
