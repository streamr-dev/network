import { inspect } from 'util'
import { wait } from 'streamr-test-utils'
import { providers, Wallet } from 'ethers'
import { pTimeout, counterId, AggregatedError } from '../src/utils'
import { MaybeAsync } from '../src/types'
import { validateOptions } from '../src/stream/utils'
import type { StreamPartDefinitionOptions, StreamProperties } from '../src/stream'
import { StreamrClient } from '../src/StreamrClient'
import { PublishRequest } from 'streamr-client-protocol/dist/src/protocol/control_layer'

const crypto = require('crypto')
const config = require('./integration/config')

export const uid = (prefix?: string) => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

export function fakePrivateKey() {
    return crypto.randomBytes(32).toString('hex')
}

export function fakeAddress() {
    return crypto.randomBytes(32).toString('hex').slice(0, 40)
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

export async function collect(iterator: any, fn: MaybeAsync<(item: any) => void> = async () => {}) {
    const received: any[] = []
    for await (const msg of iterator) {
        received.push(msg.getParsedContent())
        await fn({
            msg, iterator, received,
        })
    }

    return received
}

export function getTestSetTimeout(): (...args: Parameters<typeof setTimeout>) => ReturnType<typeof setTimeout> {
    const addAfter = addAfterFn()
    return (...args: Parameters<typeof setTimeout>) => {
        const t = setTimeout(...args)
        addAfter(() => {
            clearTimeout(t)
        })
        return t
    }
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

export const Msg = (opts?: any) => ({
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
            streamId,
            streamPartition = 0,
            interval = 500,
            timeout = 10000,
            count = 100,
            messageMatchFn = defaultMessageMatchFn
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
                const err: any = new Error(`timed out after ${duration}ms waiting for message: ${inspect(publishRequest)}`)
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

type PublishOpts = {
    testName: string,
    delay: number
    timeout: number
    waitForLast: boolean
    waitForLastCount: number
    waitForLastTimeout: number
    beforeEach: (m: any) => any
    afterEach: (msg: any, request: any) => Promise<void> | void
    timestamp: number | (() => number)
    partitionKey: string
    createMessage: () => Promise<any> | any
}

type PublishTestMessagesOpts = StreamPartDefinitionOptions & Partial<PublishOpts>

export function getPublishTestMessages(client: StreamrClient, defaultOptsOrStreamId: string | PublishTestMessagesOpts = {}) {
    // second argument could also be streamId
    let defaultOpts: PublishTestMessagesOpts
    if (typeof defaultOptsOrStreamId === 'string') {
        // eslint-disable-next-line no-param-reassign
        defaultOpts = {
            streamId: defaultOptsOrStreamId as string,
        }
    } else {
        defaultOpts = defaultOptsOrStreamId as PublishTestMessagesOpts
    }

    const publishTestMessagesRaw = async (n = 4, opts: PublishTestMessagesOpts = {}) => {
        const id = 'testName' in opts ? opts.testName : uid('test')
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
        } = validateOptions<PublishTestMessagesOpts>({
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

            const published: [ message: any, request: PublishRequest ][] = []
            /* eslint-disable no-await-in-loop, no-loop-func */
            for (let i = 0; i < n; i++) {
                if (connectionDone) { break }
                const message = createMessage()
                await beforeEach(message)
                if (connectionDone) { break }
                const request = await pTimeout(client.publish(
                    { streamId, streamPartition },
                    message,
                    typeof timestamp === 'function' ? timestamp() : timestamp,
                    partitionKey
                ), timeout, `publish timeout ${streamId}: ${i} ${inspect(message)}`).catch((err) => {
                    if (connectionDone && err.message.includes('Needs connection')) {
                        // ignore connection closed error
                        return
                    }
                    throw err
                })
                published.push([
                    message,
                    // @ts-expect-error
                    request,
                ])
                if (connectionDone) { break }

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

// eslint-disable-next-line no-undef
const getTestName = (module: NodeModule) => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

const randomTestRunId = crypto.randomBytes(4).toString('hex')
// eslint-disable-next-line no-undef
export const createRelativeTestStreamId = (module: NodeModule, suffix?: string) => {
    return counterId(`/test/${randomTestRunId}/${getTestName(module)}${(suffix !== undefined) ? '-' + suffix : ''}`, '-')
}

// eslint-disable-next-line no-undef
export const createTestStream = (streamrClient: StreamrClient, module: NodeModule, props?: Partial<StreamProperties>) => {
    return streamrClient.createStream({
        id: createRelativeTestStreamId(module),
        ...props
    })
}
