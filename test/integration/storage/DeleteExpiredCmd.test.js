const cassandra = require('cassandra-driver')
const { TimeUuid } = require('cassandra-driver').types

const DeleteExpiredCmd = require('../../../src/storage/DeleteExpiredCmd')
const { createClient } = require('../../utils')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const DAY_IN_MS = 1000 * 60 * 60 * 24

const insertBucket = async (cassandraClient, streamId, dateCreate) => {
    const bucketId = TimeUuid.fromDate(new Date(dateCreate)).toString()
    const query = 'INSERT INTO bucket (stream_id, partition, date_create, id, records, size)'
        + 'VALUES (?, 0, ?, ?, 1, 1)'
    await cassandraClient.execute(query, [streamId, dateCreate, bucketId], {
        prepare: true
    })
    return bucketId
}

const insertData = async (cassandraClient, streamId, bucketId, ts) => {
    const insert = 'INSERT INTO stream_data '
        + '(stream_id, partition, bucket_id, ts, sequence_no, publisher_id, msg_chain_id, payload) '
        + 'VALUES (?, 0, ?, ?, 0, ?, ?, ?)'
    await cassandraClient.execute(insert, [
        streamId, bucketId, new Date(ts), 'publisherId', 'msgChainId', Buffer.from('{}')
    ], {
        prepare: true
    })
}

const checkDBCount = async (cassandraClient, streamId) => {
    const countBuckets = 'SELECT COUNT(*) FROM bucket WHERE stream_id = ? AND partition = 0 ALLOW FILTERING'
    const bucketResult = await cassandraClient.execute(countBuckets, [streamId], {
        prepare: true
    })
    const countData = 'SELECT COUNT(*) FROM stream_data WHERE stream_id = ? AND partition = 0 ALLOW FILTERING'
    const messageResult = await cassandraClient.execute(countData, [streamId], {
        prepare: true
    })
    return {
        bucketCount: bucketResult.first().count.low,
        messageCount: messageResult.first().count.low
    }
}

describe('DeleteExpiredCmd', () => {
    let client
    let cassandraClient
    let deleteExpiredCmd

    beforeEach(async () => {
        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })
        client = createClient(9999, {
            auth: {
                apiKey: 'tester1-api-key'
            },
            orderMessages: false,
        })
        deleteExpiredCmd = new DeleteExpiredCmd({
            streamrBaseUrl: 'http://localhost:8081/streamr-core',
            cassandraUsername: '',
            cassandraPassword: '',
            cassandraHosts: ['localhost'],
            cassandraDatacenter: 'datacenter1',
            cassandraKeyspace: 'streamr_dev_v2',
            dryRun: false
        })
    })

    afterEach(async () => {
        await cassandraClient.shutdown()
    })

    const daysArray = [0, 1, 2, 3]
    daysArray.map(async (days) => {
        test(`keep in database ${days} days of data`, async () => {
            const id = '0xadb88a496199365b69b2a12816b6b6bba27cc4c1/DeleteExpiredCmd.test.js-' + Date.now()
            const stream = await client.createStream({
                id,
                name: id,
                storageDays: days
            })
            const streamId = stream.id

            const bucketId1 = await insertBucket(cassandraClient, streamId, Date.now() - 0 * DAY_IN_MS)
            const bucketId2 = await insertBucket(cassandraClient, streamId, Date.now() - 1 * DAY_IN_MS)
            const bucketId3 = await insertBucket(cassandraClient, streamId, Date.now() - 2 * DAY_IN_MS)
            const bucketId4 = await insertBucket(cassandraClient, streamId, Date.now() - 3 * DAY_IN_MS)

            await insertData(cassandraClient, streamId, bucketId1, Date.now() - 0 * DAY_IN_MS)
            await insertData(cassandraClient, streamId, bucketId2, Date.now() - 1 * DAY_IN_MS)
            await insertData(cassandraClient, streamId, bucketId3, Date.now() - 2 * DAY_IN_MS)
            await insertData(cassandraClient, streamId, bucketId4, Date.now() - 3 * DAY_IN_MS)

            await deleteExpiredCmd.run()
            const counts = await checkDBCount(cassandraClient, streamId, days)
            expect(counts).toEqual({
                bucketCount: days,
                messageCount: days
            })
        }, 10 * 1000)
    })

    test('max message timestamp of bucket is taken into consideration', async () => {
        const id = '0xadb88a496199365b69b2a12816b6b6bba27cc4c1/DeleteExpiredCmd.test.js-' + Date.now()
        const stream = await client.createStream({
            id,
            name: id,
            storageDays: 10
        })
        const streamId = stream.id

        const bucketId = await insertBucket(cassandraClient, streamId, Date.now() - 30 * DAY_IN_MS)
        await insertData(cassandraClient, streamId, bucketId, Date.now() - 30 * DAY_IN_MS)
        await insertData(cassandraClient, streamId, bucketId, Date.now() - 15 * DAY_IN_MS)
        // prevents bucket from being deleted
        await insertData(cassandraClient, streamId, bucketId, Date.now() - 3 * DAY_IN_MS)

        await deleteExpiredCmd.run()
        const counts = await checkDBCount(cassandraClient, streamId)
        expect(counts).toEqual({
            bucketCount: 1,
            messageCount: 3
        })
    })
})
