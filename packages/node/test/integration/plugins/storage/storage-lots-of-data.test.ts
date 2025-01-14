import { randomUserId } from '@streamr/test-utils'
import { Logger } from '@streamr/utils'
import { randomFillSync } from 'crypto'
import toArray from 'stream-to-array'
import { startCassandraStorage, Storage } from '../../../../src/plugins/storage/Storage'
import { getTestName, STREAMR_DOCKER_DEV_HOST } from '../../../utils'
import { buildMsg } from './Storage.test'

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'
const MAX_BUCKET_MESSAGE_COUNT = 20

const NUM_MESSAGES = 1000
const MESSAGE_SIZE = 1e3 // 1k

const logger = new Logger(module)

function retryFlakyTest(
    fn: () => Promise<unknown>,
    isFlakyError: (e: Error) => boolean,
    maxRuns: number
): () => Promise<void> {
    return async () => {
        for (let i = 1; i <= maxRuns; ++i) {
            try {
                await fn()
                return
            } catch (e) {
                if (isFlakyError(e)) {
                    logger.warn(`Detected flaky test run (attempt ${i}/${maxRuns})`)
                    if (i === maxRuns) {
                        throw e
                    }
                } else {
                    throw e
                }
            }
        }
    }
}

describe('Storage: lots of data', () => {
    let storage: Storage
    let streamId: string

    beforeAll(async () => {
        storage = await startCassandraStorage({
            contactPoints,
            localDataCenter,
            keyspace,
            opts: {
                maxBucketRecords: MAX_BUCKET_MESSAGE_COUNT,
                checkFullBucketsTimeout: 100,
                storeBucketsTimeout: 100,
                bucketKeepAliveSeconds: 1
            }
        })
        streamId = `${getTestName(module)}-${Date.now()}`
    })

    afterAll(async () => {
        await storage.close()
    })

    beforeAll(async () => {
        const storePromises = []
        const randomBuffer = Buffer.alloc(MESSAGE_SIZE)
        const publisherId = randomUserId()
        for (let i = 0; i < NUM_MESSAGES; i++) {
            randomFillSync(randomBuffer)
            const msg = buildMsg({
                streamId,
                streamPartition: 0,
                timestamp: 1000000 + (i + 1),
                sequenceNumber: 0,
                publisherId,
                content: randomBuffer.toString('hex')
            })
            storePromises.push(() => storage.store(msg))
        }
        const half = Math.floor(storePromises.length / 2)
        await Promise.all(storePromises.slice(0, half).map((fn) => fn()))
        await Promise.all(storePromises.slice(half).map((fn) => fn()))
    }, 60000)

    it(`can store ${NUM_MESSAGES} ${MESSAGE_SIZE} byte messages and requestLast 1`, async () => {
        const streamingResults = storage.requestLast(streamId, 0, 1)
        const results = await toArray(streamingResults)
        expect(results.length).toEqual(1)
    })

    it('can requestLast all', async () => {
        const streamingResults = storage.requestLast(streamId, 0, NUM_MESSAGES)
        const results = await toArray(streamingResults)
        expect(results.length).toEqual(NUM_MESSAGES)
    })

    it('can requestLast all again', async () => {
        const streamingResults = storage.requestLast(streamId, 0, NUM_MESSAGES)
        const results = await toArray(streamingResults)
        expect(results.length).toEqual(NUM_MESSAGES)
    })

    // TODO: Determine actual reason for flaky behavior in NET-918, something to do with cassandra-driver?
    it(
        'can requestFrom',
        retryFlakyTest(
            async () => {
                const streamingResults = storage.requestFrom(streamId, 0, 1000, 0, undefined)
                const results = await toArray(streamingResults)
                expect(results.length).toEqual(NUM_MESSAGES)
            },
            (e) => e.message?.includes('The value of "offset" is out of range'),
            5
        )
    )

    // TODO: Determine actual reason for flaky behavior in NET-918, something to do with cassandra-driver?
    it(
        'can requestFrom again',
        retryFlakyTest(
            async () => {
                const streamingResults = storage.requestFrom(streamId, 0, 1000, 0, undefined)
                const results = await toArray(streamingResults)
                expect(results.length).toEqual(NUM_MESSAGES)
            },
            (e) => e.message?.includes('The value of "offset" is out of range'),
            5
        )
    )
})
