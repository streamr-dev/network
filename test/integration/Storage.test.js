const cassandra = require('cassandra-driver')
const toArray = require('stream-to-array')
const { startCassandraStorage } = require('../../src/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

describe('Storage', () => {
    let storage
    let streamId
    let cassandraClient
    let streamIdx = 1

    beforeAll(async () => {
        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })
    })

    afterAll(() => {
        cassandraClient.shutdown()
    })

    beforeEach(async () => {
        storage = await startCassandraStorage(contactPoints, localDataCenter, keyspace)
        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
    })

    afterEach(async () => {
        await storage.close()
    })

    test('store messages into Cassandra', async () => {
        const data = {
            hello: 'world',
            value: 6,
        }
        await storage.store(streamId, 10, 1545144750494, 0, 'publisher', data)

        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE id = ? AND partition = 10', [streamId])
        expect(result.rows.length).toEqual(1)
        expect(result.rows[0]).toEqual({
            id: streamId,
            partition: 10,
            ts: new Date(1545144750494),
            sequence_no: 0,
            publisher_id: 'publisher',
            payload: Buffer.from(JSON.stringify(data)),
        })
    })

    test('fetch latest messages', async () => {
        await storage.store(streamId, 10, 0, 0, 'publisher', {})
        await storage.store(streamId, 10, 1000, 0, 'publisher', {})
        await storage.store(streamId, 10, 2000, 0, 'publisher', {})
        await storage.store(streamId, 10, 3000, 0, 'publisher', {})
        await storage.store(streamId, 10, 3000, 3, 'publisher', {})
        await storage.store(streamId, 10, 3000, 2, 'publisher', {})
        await storage.store(streamId, 10, 3000, 1, 'publisher', {})
        await storage.store(streamId, 10, 4000, 0, 'publisher', {})
        await storage.store(streamId, 666, 8000, 0, 'publisher', {})
        await storage.store(`${streamId}-wrong`, 10, 8000, 0, 'publisher', {})

        const streamingResults = await storage.fetchLatest(streamId, 10, 3)
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 2,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 3,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 4000,
                sequenceNo: 0,
                publisherId: 'publisher',
                payload: '{}',
            },
        ])
    })

    test('fetch messages starting from a timestamp', async () => {
        await storage.store(streamId, 10, 0, 0, 'publisher', {})
        await storage.store(streamId, 10, 1000, 0, 'publisher', {})
        await storage.store(streamId, 10, 2000, 0, 'publisher', {})
        await storage.store(streamId, 10, 3000, 0, 'publisher', {})
        await storage.store(streamId, 10, 3000, 3, 'publisher', {})
        await storage.store(streamId, 10, 3000, 2, 'publisher', {})
        await storage.store(streamId, 10, 3000, 1, 'publisher', {})
        await storage.store(streamId, 10, 4000, 0, 'publisher', {})
        await storage.store(streamId, 666, 8000, 0, 'publisher', {})
        await storage.store(`${streamId}-wrong`, 10, 8000, 0, 'publisher', {})

        const streamingResults = storage.fetchFromTimestamp(streamId, 10, 3000)
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 0,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 1,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 2,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 3,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 4000,
                sequenceNo: 0,
                publisherId: 'publisher',
                payload: '{}',
            },
        ])
    })

    test('fetch messages in a timestamp range', async () => {
        await storage.store(streamId, 10, 0, 0, 'publisher', {})
        await storage.store(streamId, 10, 1000, 0, 'publisher', {})
        await storage.store(streamId, 10, 2000, 0, 'publisher', {})
        await storage.store(streamId, 10, 2500, 0, 'publisher', {})
        await storage.store(streamId, 10, 2500, 2, 'publisher', {})
        await storage.store(streamId, 10, 2500, 1, 'publisher', {})
        await storage.store(streamId, 10, 3000, 0, 'publisher', {})
        await storage.store(streamId, 10, 4000, 0, 'publisher', {})
        await storage.store(streamId, 666, 2500, 0, 'publisher', {})
        await storage.store(`${streamId}-wrong`, 10, 3000, 0, 'publisher', {})

        const streamingResults = storage.fetchBetweenTimestamps(streamId, 10, 1500, 3500)
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            {
                streamId,
                streamPartition: 10,
                ts: 2000,
                sequenceNo: 0,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 2500,
                sequenceNo: 0,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 2500,
                sequenceNo: 1,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 2500,
                sequenceNo: 2,
                publisherId: 'publisher',
                payload: '{}',
            },
            {
                streamId,
                streamPartition: 10,
                ts: 3000,
                sequenceNo: 0,
                publisherId: 'publisher',
                payload: '{}',
            },
        ])
    })
})
