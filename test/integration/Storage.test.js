const cassandra = require('cassandra-driver')
const toArray = require('stream-to-array')
const { startCassandraStorage } = require('../../src/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

describe('Storage', () => {
    let streamId
    let cassandraClient

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

    beforeEach(() => {
        streamId = `stream-id-${Date.now()}`
    })

    test('store messages into Cassandra', async () => {
        const data = {
            hello: 'world',
            value: 6,
        }
        const storage = await startCassandraStorage(contactPoints, localDataCenter, keyspace)
        await storage.store(streamId, 10, 1545144750494, 0, 'publisher', data)
        await storage.close()

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

    test('fetch messages starting from a timestamp', async () => {
        let storage = await startCassandraStorage(contactPoints, localDataCenter, keyspace)
        await storage.store(streamId, 10, 0, 0, 'publisher', {})
        await storage.store(streamId, 10, 1000, 0, 'publisher', {})
        await storage.store(streamId, 10, 2000, 0, 'publisher', {})
        await storage.store(streamId, 10, 2001, 0, 'publisher', {})
        await storage.store(streamId, 10, 3000, 0, 'publisher', {})
        await storage.store(streamId, 10, 4000, 0, 'publisher', {})
        await storage.store(streamId, 666, 8000, 0, 'publisher', {})
        await storage.store(`${streamId}-wrong`, 10, 8000, 0, 'publisher', {})
        await storage.close()

        storage = await startCassandraStorage(contactPoints, localDataCenter, keyspace)
        const stream = storage.fetchFromTimestamp(streamId, 10, 2001)
        const results = await toArray(stream)

        expect(results).toEqual([
            {
                streamId,
                streamPartition: 10,
                ts: 2001,
                sequenceNo: 0,
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
})
