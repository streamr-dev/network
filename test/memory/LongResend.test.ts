import { wait } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { MessageLayer } from 'streamr-client-protocol'
import { Stream } from '../../src/stream'
import { Subscription } from '../../src/subscribe'
import { fakePrivateKey } from '../utils'
import Connection from '../../src/Connection'
import prettyBytes from 'pretty-bytes'

const TRAM_DEMO_STREAM = '7wa7APtlTq6EC5iTCBy6dw'
/* eslint-disable require-atomic-updates, no-loop-func */

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

describe('LongResend', () => {
    let client: StreamrClient
    let stream: Stream
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()

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
        expectErrors = 0
        onError = jest.fn()
        client.onError = jest.fn()
        client.on('error', onError)
        stream = await client.getStream(TRAM_DEMO_STREAM)
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
        test.only(`can get a resend of size ${size}`, async () => {
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
        }, Math.max(10000, size))
    })

    describe('large number of messages', () => {
        let rssValues: number[] = []
        let totalBytes = 0
        let count = 0
        let sub: Subscription

        const onMessage = (maxMessages: number) => (msg: any, streamMessage: MessageLayer.StreamMessage) => {
            totalBytes += Buffer.byteLength(streamMessage.serializedContent, 'utf8')
            if (count % 1000 === 0) {
                const { rss } = process.memoryUsage()
                rssValues.push(rss)
                // eslint-disable-next-line no-console
                console.info({
                    msg,
                    count,
                    memory: logMemory(),
                    total: prettyBytes(totalBytes)
                })
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
            // eslint-disable-next-line no-console
            console.info('done', {
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

        test('realtime', async () => {
            // might not work on weekends :/
            const MAX_MEMORY_USAGE = 2e+8 // 300MB
            const MAX_MESSAGES = 10000
            sub = await client.subscribe({
                stream: stream.id,
            }, onMessage(MAX_MESSAGES))
            await sub.onDone()
            validate(MAX_MEMORY_USAGE)
        }, 120000)

        test('resendSubscribe', async () => {
            // might not work on weekends :/
            const MAX_MEMORY_USAGE = 2e+8 // 300MB
            const MAX_MESSAGES = 10000
            sub = await client.subscribe({
                stream: stream.id,
                resend: {
                    last: Math.floor(MAX_MESSAGES / 2),
                }
            }, onMessage(MAX_MESSAGES))
            await sub.onDone()
            validate(MAX_MEMORY_USAGE)
        }, 120000)

        test('resend', async () => {
            const MAX_MEMORY_USAGE = 5e+8 // 500MB
            const MAX_MESSAGES = 60000 // 60k
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
            }, onMessage(MAX_MESSAGES))
            await sub.onDone()
            validate(MAX_MEMORY_USAGE)
        }, 1000000)
    })
})
