import { wait } from 'streamr-test-utils'
import { Debug } from '../../src/utils/log'
import { StreamrClient } from '../../src/StreamrClient'
import { MessageLayer } from 'streamr-client-protocol'
import { Stream } from '../../src/stream'
import { Subscription } from '../../src/subscribe'
import { fakePrivateKey, addAfterFn } from '../utils'
import Connection from '../../src/Connection'
import prettyBytes from 'pretty-bytes'

const TRAM_DEMO_STREAM = '7wa7APtlTq6EC5iTCBy6dw'

const log = Debug('test:MessageQuantityTest')

function logMemory() {
    const res = process.memoryUsage()
    return {
        rss: prettyBytes(res.rss),
        heapTotal: prettyBytes(res.heapTotal),
        heapUsed: prettyBytes(res.heapUsed),
        external: prettyBytes(res.external),
        arrayBuffers: prettyBytes(res.arrayBuffers),
    }
}

// requires live TRAM_DEMO_STREAM to generate bulk data, but the stream seems
// to fall over all the time so this test isn't very reliable
describe.skip('no memleaks when processing a high quantity of large messages', () => {
    let client: StreamrClient
    let stream: Stream
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    const afterFn = addAfterFn()

    const createClient = (opts = {}) => new StreamrClient({
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeEach(async () => {
        client = createClient({
            auth: {
                privateKey: fakePrivateKey(),
            }
        })
        await client.connect()
    })

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
        client.onError = jest.fn()
        client.on('error', onError)
        stream = await client.getStream(TRAM_DEMO_STREAM)
    })

    beforeEach(() => {
        if (!process.env.DEBUG) { return }
        client.debug('disabling verbose client logging for long tests')
        Debug.disable()
        Debug.enable('MessageQuantityTest')
    })

    afterEach(() => {
        if (!process.env.DEBUG) { return }
        Debug.enable(process.env.DEBUG)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(500)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    describe('resends of different sizes', () => {
        const RESEND_SIZES = [
            1,
            10,
            20,
            100,
            1000,
            10000,
            25000, // will be ignored, max is 10,000
        ]

        const MAX_RESEND_SIZE = 10000

        RESEND_SIZES.forEach((size) => {
            test(`can get a resend of size ${size}`, async () => {
                const id = `TEST ${size}`
                let count = 0
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        last: size
                    },
                }, () => {
                    count += 1
                })
                await sub.onDone()
                client.debug(id, { count })
                if (size < MAX_RESEND_SIZE) {
                    expect(count).toBe(size)
                } else {
                    expect(count).toBe(10000)
                }
            }, Math.max(10000, size) * 2)
        })
    })

    describe('large number of messages', () => {
        let rssValues: number[] = []
        let totalBytes = 0
        let count = 0
        let sub: Subscription

        const onMessage = (maxMessages: number, maxMemoryUsage: number) => (msg: any, streamMessage: MessageLayer.StreamMessage) => {
            totalBytes += Buffer.byteLength(streamMessage.serializedContent, 'utf8')
            if (count % 1000 === 0) {
                const { rss } = process.memoryUsage()
                rssValues.push(rss)
                log({
                    msg,
                    count,
                    memory: logMemory(),
                    total: prettyBytes(totalBytes)
                })
                expect(rss).toBeLessThan(maxMemoryUsage)
            }

            if (count === maxMessages) {
                sub.unsubscribe()
            } else {
                count += 1
            }
        }

        function validate(maxMemoryUsage: number) {
            const max = rssValues.length ? rssValues.reduce((a, b) => Math.max(a, b), 0) : 0
            const min = rssValues.length ? rssValues.reduce((a, b) => Math.min(a, b)) : 0
            const mean = rssValues.length ? rssValues.reduce((a, b) => a + b, 0) / rssValues.length : 0
            const median = rssValues.length ? rssValues[Math.floor(rssValues.length / 2)] : 0
            const variance = rssValues.length ? Math.sqrt(rssValues.reduce((a, b) => a + ((b - mean) ** 2), 0) / rssValues.length) : 0
            log('done', {
                max: prettyBytes(max),
                min: prettyBytes(min),
                mean: prettyBytes(mean),
                median: prettyBytes(median),
                variance: prettyBytes(variance),
                count,
                memory: logMemory(),
                total: prettyBytes(totalBytes)
            })
            expect(max).toBeLessThan(maxMemoryUsage)
        }

        beforeEach(() => {
            rssValues = []
            totalBytes = 0
            count = 0
        })

        afterEach(async () => {
            if (sub) {
                await sub.unsubscribe()
            }
        })

        describe('with realtime', () => {
            const MAX_MEMORY_USAGE = 2e+8 // 200MB
            // run for period or some number of messages, whichever comes first
            const MAX_TEST_TIME = 300000 // 5min
            const MAX_MESSAGES = MAX_TEST_TIME / 10
            const MIN_RECEIVED_MESSAGES = 5000 // needs at least this many messages to detect leak

            test('just realtime', async () => {
                sub = await client.subscribe({
                    stream: stream.id,
                }, onMessage(MAX_MESSAGES, MAX_MEMORY_USAGE))
                const t = setTimeout(() => {
                    sub.unsubscribe()
                }, MAX_TEST_TIME)
                afterFn(() => {
                    clearTimeout(t)
                })
                await sub.onDone()
                clearTimeout(t)
                validate(MAX_MEMORY_USAGE)
                expect(count).toBeGreaterThanOrEqual(MIN_RECEIVED_MESSAGES)
            }, MAX_TEST_TIME * 2)

            test('resendSubscribe', async () => {
                sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: Math.floor(MAX_MESSAGES / 2),
                    }
                }, onMessage(MAX_MESSAGES, MAX_MEMORY_USAGE))
                const t = setTimeout(() => {
                    sub.unsubscribe()
                }, MAX_TEST_TIME)
                afterFn(() => {
                    clearTimeout(t)
                })
                await sub.onDone()
                clearTimeout(t)
                await sub.onDone()
                validate(MAX_MEMORY_USAGE)
                expect(count).toBeGreaterThanOrEqual(MIN_RECEIVED_MESSAGES)
            }, MAX_TEST_TIME * 2)
        })

        describe('just resend', () => {
            const MAX_TEST_TIME = 300000 // 5min
            const MAX_MEMORY_USAGE = 5e+8 // 500MB
            const MAX_MESSAGES = 60000 // 60k
            const MIN_RECEIVED_MESSAGES = 15000

            it('works', async () => {
                const end = 1616509054932
                const start = end - (1 * 60 * 60 * 1000) // 1 hour
                sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: start,
                        },
                        to: {
                            timestamp: end,
                        }
                    },
                }, onMessage(MAX_MESSAGES, MAX_MEMORY_USAGE))

                const t = setTimeout(() => {
                    sub.unsubscribe()
                }, MAX_TEST_TIME)
                afterFn(() => {
                    clearTimeout(t)
                })
                await sub.onDone()
                validate(MAX_MEMORY_USAGE)
                expect(count).toBeGreaterThanOrEqual(MIN_RECEIVED_MESSAGES)
            }, MAX_TEST_TIME * 2)
        })
    })
})
