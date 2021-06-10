import { wait } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { PublishRequest } from 'streamr-client-protocol'
import { Stream } from '../../src/stream'
import { fakePrivateKey, getPublishTestMessages, CreateMessageOpts, Debug } from '../utils'
import Connection from '../../src/Connection'
import prettyBytes from 'pretty-bytes'
import { randomFillSync } from 'crypto'
import { writeHeapSnapshot } from 'v8'

const { WRITE_SNAPSHOTS } = process.env

const log = Debug('StreamrMemoryUsage Publish Memory Usage')

function snapshot() {
    if (!WRITE_SNAPSHOTS) { return '' }
    return writeHeapSnapshot()
}

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

describe('no memleaks when publishing a high quantity of large messages', () => {
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    let client: StreamrClient
    let stream: Stream
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    // const afterFn = addAfterFn()

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
        stream = await client.createStream({
            requireSignedData: true,
        })
        publishTestMessages = getPublishTestMessages(client, {
            stream
        })
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

    describe('publishing large messages', () => {
        // const MAX_MEMORY_USAGE = 2e+8 // 200MB
        const NUM_SNAPSHOTS = 5
        const NUM_MESSAGES = 10000
        const MESSAGE_SIZES = [
            1, // 1B
            // 1e3, // 1KB
            // 64e3, // 64KB
            // 256e3, // 256KB
            // 512e3, // 512KB
            // 1e6, // 1MB
        ]
        const BATCH_SIZES = [
            // 4,
            32,
            // 64,
        ]

        let rssValues: number[] = []
        let totalBytes = 0
        let count = 0

        function validate() {
            log('validate')
            const max = rssValues.length ? rssValues.reduce((a, b) => Math.max(a, b), 0) : 0
            const min = rssValues.length ? rssValues.reduce((a, b) => Math.min(a, b)) : 0
            const mean = rssValues.length ? rssValues.reduce((a, b) => a + b, 0) / rssValues.length : 0
            const median = rssValues.length ? rssValues[Math.floor(rssValues.length / 2)] : 0
            const variance = rssValues.length ? Math.sqrt(rssValues.reduce((a, b) => a + ((b - mean) ** 2), 0) / rssValues.length) : 0
            rssValues = []
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
        }

        beforeEach(() => {
            rssValues = []
            totalBytes = 0
            count = 0
        })

        afterEach(async () => {
            log({
                count,
                memory: logMemory(),
                total: prettyBytes(totalBytes)
            })

            snapshot()
            await wait(10000)
        })

        BATCH_SIZES.forEach((batchSize) => {
            MESSAGE_SIZES.forEach((size) => {
                const randomBuffer = Buffer.alloc(size)

                test(`can publish ${NUM_MESSAGES} messages of ${prettyBytes(size)} in batches of ${batchSize}`, async () => {
                    const id = `can publish ${NUM_MESSAGES} messages of ${prettyBytes(size)} in batches of ${batchSize}`
                    await publishTestMessages(NUM_MESSAGES, {
                        retainMessages: false,
                        timeout: 30000,
                        delay: 100,
                        batchSize,
                        concurrency: batchSize,
                        createMessage({ index, batchIndex, batch, total }: CreateMessageOpts) {
                            randomFillSync(randomBuffer)
                            return {
                                test: id,
                                value: `${index + 1} of ${total} (${batchIndex + 1} of ${batchSize} in batch ${batch})`,
                                payload: randomBuffer.toString('utf8')
                            }
                        },
                        afterEach(msg: any, publishRequest: PublishRequest) {
                            count += 1
                            totalBytes += Buffer.byteLength(publishRequest.streamMessage.serializedContent, 'utf8')
                            if (count % 1000 === 0) {
                                log({
                                    msg: {
                                        ...msg,
                                        payload: `[…${prettyBytes(Buffer.byteLength(msg.payload))}]`
                                    },
                                    count,
                                    memory: logMemory(),
                                    total: prettyBytes(totalBytes)
                                })
                            }
                            const { rss } = process.memoryUsage()
                            rssValues.push(rss)

                            if (count % Math.floor(NUM_MESSAGES / NUM_SNAPSHOTS) === 0) {
                                snapshot()
                            }
                        }
                    })
                    log('DONE')

                    validate()
                }, 60 * 60000)
            })
        })
    })
})
