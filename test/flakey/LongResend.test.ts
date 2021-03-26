import { wait } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/stream'
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
        test(`can get a resend of size ${size}`, async () => {
            const id = `TEST ${size}`
            let count = 0
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    from: 0
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

    test.only('can get big resend', async () => {
        let count = 0
        const MAX_MESSAGES = 60000 // 60k
        const end = 1616509054932
        const start = end - (1 * 60 * 60 * 1000) // 1 hour
        const rssValues: number[] = []
        let total = 0
        const sub = await client.resend({
            stream: stream.id,
            resend: {
                from: {
                    timestamp: start,
                },
                to: {
                    timestamp: end,
                }
            },
        }, (msg, streamMessage) => {
            total += Buffer.byteLength(streamMessage.serializedContent, 'utf8')
            if (count % 1000 === 0) {
                const { rss } = process.memoryUsage()
                rssValues.push(rss)
                console.info({
                    msg,
                    count,
                    memory: logMemory(),
                    total: prettyBytes(total)
                })
            }

            if (count === MAX_MESSAGES) {
                sub.unsubscribe()
            } else {
                count += 1
            }
        })
        await sub.onDone()
        const max = rssValues.reduce((a, b) => Math.max(a, b), 0)
        const min = rssValues.reduce((a, b) => Math.min(a, b), Infinity)
        const mean = rssValues.reduce((a, b) => a + b, 0) / rssValues.length
        const median = rssValues[Math.floor(rssValues.length / 2)]
        const variance = Math.sqrt(rssValues.reduce((a, b) => a + ((b - mean) ** 2), 0) / rssValues.length)
        console.info('done', {
            max: prettyBytes(max),
            min: prettyBytes(min),
            mean: prettyBytes(mean),
            median: prettyBytes(median),
            variance: prettyBytes(variance),
            count,
            memory: logMemory(),
            total: prettyBytes(total)
        })
    }, 1000000)
})
