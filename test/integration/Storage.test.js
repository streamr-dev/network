const cassandra = require('cassandra-driver')
const { startCassandraStorage } = require('../../src/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

describe('Storage', () => {
    let streamId
    let cassandraClient

    beforeAll(async () => {
        streamId = `stream-id-${Date.now()}`
        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })
    })

    afterAll(() => {
        cassandraClient.shutdown()
    })

    test('store DataMessage into Cassandra', async () => {
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
})
