import { Client, types as cassandraTypes } from 'cassandra-driver'
const { TimeUuid } = cassandraTypes
import { BucketManager } from '../../../../src/plugins/storage/BucketManager'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'
import { until } from '@streamr/utils'

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

describe('BucketManager', () => {
    let bucketManager: BucketManager
    let streamId: string
    let cassandraClient: Client
    let streamIdx = 1

    const insertBuckets = async (startTimestamp: Date) => {
        for (let i = 0; i < 100; i++) {
            const currentTimestamp = new Date(startTimestamp.getTime() + i * 60 * 1000) // + "i" minutes
            await cassandraClient.execute(
                'INSERT INTO bucket (stream_id, partition, date_create, id, records, size) ' +
                    'VALUES (?, 0, ?, ?, 5, 5)',
                [streamId, currentTimestamp, TimeUuid.fromDate(currentTimestamp).toString()],
                {
                    prepare: true
                }
            )
        }
    }

    beforeEach(async () => {
        cassandraClient = new Client({
            contactPoints,
            localDataCenter,
            keyspace
        })

        await cassandraClient.connect()
        bucketManager = new BucketManager(cassandraClient, {
            checkFullBucketsTimeout: 1000,
            storeBucketsTimeout: 1000,
            maxBucketSize: 10 * 300,
            maxBucketRecords: 10,
            bucketKeepAliveSeconds: 60
        })

        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
    })

    afterEach(async () => {
        bucketManager.stop()
        await cassandraClient.shutdown()
    })

    test('calling getBucketId() will try to find bucket in database and then create if not found and store in database', async () => {
        const timestamp = Date.now()

        const storeBucketsSpy = jest.spyOn(bucketManager, 'storeBuckets' as any)

        expect(Object.values(bucketManager.streamParts)).toHaveLength(0)
        expect(Object.values(bucketManager.buckets)).toHaveLength(0)

        expect(bucketManager.getBucketId(streamId, 0, timestamp)).toBeUndefined()
        let result = await cassandraClient.execute('SELECT * FROM bucket WHERE stream_id = ? ALLOW FILTERING', [
            streamId
        ])
        expect(result.rows.length).toEqual(0)

        // first time we call in constructor, second after timeout
        await until(() => storeBucketsSpy.mock.calls.length === 2)
        expect(storeBucketsSpy).toHaveBeenCalled()

        const foundBucketId = bucketManager.getBucketId(streamId, 0, timestamp)!
        expect(foundBucketId).not.toBeUndefined()
        expect(bucketManager.buckets[foundBucketId].size).toEqual(0)
        expect(bucketManager.buckets[foundBucketId].records).toEqual(0)

        await until(() => bucketManager.buckets[foundBucketId].isStored() === true)
        expect(bucketManager.buckets[foundBucketId].isStored()).toBeTruthy()

        bucketManager.incrementBucket(foundBucketId, 3)
        bucketManager.incrementBucket(foundBucketId, 3)
        expect(bucketManager.buckets[foundBucketId].size).toEqual(6)
        expect(bucketManager.buckets[foundBucketId].records).toEqual(2)
        expect(bucketManager.buckets[foundBucketId].isStored()).toBeFalsy()

        await until(() => bucketManager.buckets[foundBucketId].isStored())
        result = await cassandraClient.execute('SELECT * FROM bucket WHERE stream_id = ? ALLOW FILTERING', [streamId])
        const row = result.first()

        expect(row).not.toBeUndefined()
        expect(row.stream_id).toEqual(streamId)
        expect(row.partition).toEqual(0)
        expect(row.records).toEqual(2)
        expect(row.size).toEqual(6)
    })

    test('calling getBucketId() updates last know min timestamp and resets it to undefined when bucket is found', async () => {
        const timestamp = Date.now()

        expect(bucketManager.getBucketId(streamId, 0, timestamp)).toBeUndefined()
        expect(bucketManager.streamParts[`${streamId}-0`].minTimestamp).toEqual(timestamp)

        await until(() => bucketManager.getBucketId(streamId, 0, timestamp) !== undefined)
        expect(bucketManager.streamParts[`${streamId}-0`].minTimestamp).toBeUndefined()

        // future timestamp will give latest not full bucket
        expect(bucketManager.getBucketId(streamId, 0, timestamp + 600)).not.toBeUndefined()
        expect(bucketManager.streamParts[`${streamId}-0`].minTimestamp).toBeUndefined()
    })

    test('calling getBucketId() with timestamp in the past, will try to find correct bucket and then create buckets in the past', async () => {
        const timestamp = Date.now()
        const timestamp5ago = timestamp - 5 * 60 * 1000 // 5 minutes

        // find or create bucketId for NOW timestamp
        expect(bucketManager.getBucketId(streamId, 0, timestamp)).toBeUndefined()
        await until(() => bucketManager.getBucketId(streamId, 0, timestamp) !== undefined)
        const lastBucketId = bucketManager.getBucketId(streamId, 0, timestamp)!

        // find or create bucketId for NOW - 5 minutes timestamp
        expect(bucketManager.getBucketId(streamId, 0, timestamp5ago)).toBeUndefined()
        await until(() => bucketManager.getBucketId(streamId, 0, timestamp5ago) !== undefined)
        const bucketId5minAgo = bucketManager.getBucketId(streamId, 0, timestamp5ago)!

        // bucketId is not latest
        expect(lastBucketId).not.toEqual(bucketId5minAgo)

        // set stored = false
        bucketManager.incrementBucket(lastBucketId, 1)
        bucketManager.incrementBucket(bucketId5minAgo, 1)

        await until(() => bucketManager.buckets[lastBucketId].isStored())
        await until(() => bucketManager.buckets[bucketId5minAgo].isStored())

        // get latest sorted
        const lastBuckets = await bucketManager.getLastBuckets(streamId, 0, 5)
        expect(lastBuckets).toHaveLength(2)
        expect(lastBuckets[0].getId()).toEqual(lastBucketId)
        expect(lastBuckets[1].getId()).toEqual(bucketId5minAgo)

        // get latest from
        const lastBucketsFrom = await bucketManager.getBucketsByTimestamp(streamId, 0, timestamp5ago)
        expect(lastBucketsFrom).toHaveLength(2)
        expect(lastBucketsFrom[0].getId()).toEqual(lastBucketId)
        expect(lastBucketsFrom[1].getId()).toEqual(bucketId5minAgo)

        // get latest from-to
        const lastBucketsFromTo = await bucketManager.getBucketsByTimestamp(streamId, 0, timestamp5ago, timestamp)
        expect(lastBucketsFromTo).toHaveLength(2)
        expect(lastBucketsFromTo[0].getId()).toEqual(lastBucketId)
        expect(lastBucketsFromTo[1].getId()).toEqual(bucketId5minAgo)
    }, 20000)

    test('getLastBuckets(streamId, 0, n) when there are more than n buckets in database for stream streamId', async () => {
        const timestamp = new Date()
        await insertBuckets(timestamp)

        const buckets = await bucketManager.getLastBuckets(streamId, 0, 10)

        expect(buckets.length).toEqual(10)
    })

    test('getBucketsByTimestamp(streamId, 0, fromTs) when there are buckets in database for stream streamId before (and after) fromTs', async () => {
        const timestamp = new Date()
        await insertBuckets(timestamp)

        // middle
        const fromTimestamp = timestamp.getTime() + 50 * 60 * 1000
        const buckets = await bucketManager.getBucketsByTimestamp(streamId, 0, fromTimestamp)

        expect(buckets.length).toEqual(50)
    })

    // eslint-disable-next-line max-len
    test('getBucketsByTimestamp(streamId, 0, fromTs, toTs) when there are buckets in database for stream streamId outside and inside range [fromTs, toTs]', async () => {
        const timestamp = new Date()
        await insertBuckets(timestamp)

        const fromTimestamp = timestamp.getTime() + 25 * 60 * 1000
        const toTimestamp = timestamp.getTime() + 65 * 60 * 1000 - 1 // exclude 1 bucket
        const buckets = await bucketManager.getBucketsByTimestamp(streamId, 0, fromTimestamp, toTimestamp)

        expect(buckets.length).toEqual(40)
    })

    // eslint-disable-next-line max-len
    test('getBucketsByTimestamp(streamId, 0, undefined, toTs) when there are buckets in database for stream streamId after (and before) toTs', async () => {
        const timestamp = new Date()
        await insertBuckets(timestamp)

        const toTimestamp = timestamp.getTime() + 65 * 60 * 1000 - 1 // exclude 1 bucket
        const buckets = await bucketManager.getBucketsByTimestamp(streamId, 0, undefined, toTimestamp)

        expect(buckets.length).toEqual(65)
    })

    test('buckets are removed from memory after opts.bucketKeepAliveSeconds', async () => {
        const timestamp = new Date()
        bucketManager.opts.bucketKeepAliveSeconds = 3 // keep in memory 5 seconds
        await insertBuckets(timestamp)

        // load latest bucket into memory
        const latestTimestamp = timestamp.getTime() + 100 * 60 * 1000
        await until(() => bucketManager.getBucketId(streamId, 0, latestTimestamp) !== undefined)
        const bucketId = bucketManager.getBucketId(streamId, 0, latestTimestamp)!
        const bucket = bucketManager.buckets[bucketId]

        // bucket got removed after 3 seconds
        await until(() => bucket.isAlive() === false)
        await until(() => Object.values(bucketManager.buckets).length === 0)
    }, 10000)
})
