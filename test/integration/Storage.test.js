const cassandra = require('cassandra-driver')
const toArray = require('stream-to-array')
const { StreamMessage, StreamMessageV30, MessageRef } = require('streamr-client-protocol').MessageLayer
const { startCassandraStorage } = require('../../src/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

describe('Storage', () => {
    let storage
    let streamId
    let cassandraClient
    let streamIdx = 1

    function buildMsg(id, streamPartition, timestamp, sequenceNumber, publisherId = 'publisher', msgChainId = '1', content = {}) {
        return new StreamMessageV30(
            [id, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId], null,
            StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.NONE, null,
        )
    }

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
        const msg = buildMsg(streamId, 10, 1545144750494, 0, 'publisher', '1', data)
        await storage.store(msg)

        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE id = ? AND partition = 10', [streamId])
        expect(result.rows.length).toEqual(1)
        expect(result.rows[0]).toEqual({
            id: streamId,
            partition: 10,
            ts: new Date(1545144750494),
            sequence_no: 0,
            publisher_id: 'publisher',
            msg_chain_id: '1',
            payload: Buffer.from(msg.serialize()),
        })
    })

    test('fetch latest messages', async () => {
        await storage.store(buildMsg(streamId, 10, 0, 0))
        await storage.store(buildMsg(streamId, 10, 1000, 0))
        await storage.store(buildMsg(streamId, 10, 2000, 0))
        await storage.store(buildMsg(streamId, 10, 3000, 0))
        const latest2 = buildMsg(streamId, 10, 3000, 3)
        await storage.store(latest2)
        const latest1 = buildMsg(streamId, 10, 3000, 2, 'publisher2')
        await storage.store(latest1)
        await storage.store(buildMsg(streamId, 10, 3000, 1))
        const latest3 = buildMsg(streamId, 10, 4000, 0)
        await storage.store(latest3)
        await storage.store(buildMsg(streamId, 666, 8000, 0))
        await storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0))

        const streamingResults = storage.fetchLatest(streamId, 10, 3)
        const results = await toArray(streamingResults)

        expect(results).toEqual([latest1, latest2, latest3])
    })

    test('fetch messages starting from a timestamp', async () => {
        await storage.store(buildMsg(streamId, 10, 0, 0))
        await storage.store(buildMsg(streamId, 10, 1000, 0))
        await storage.store(buildMsg(streamId, 10, 2000, 0))
        const from1 = buildMsg(streamId, 10, 3000, 0)
        await storage.store(from1)
        const from4 = buildMsg(streamId, 10, 3000, 3)
        await storage.store(from4)
        const from3 = buildMsg(streamId, 10, 3000, 2, 'publisher', '2')
        await storage.store(from3)
        const from2 = buildMsg(streamId, 10, 3000, 1)
        await storage.store(from2)
        const from5 = buildMsg(streamId, 10, 4000, 0)
        await storage.store(from5)
        await storage.store(buildMsg(streamId, 666, 8000, 0))
        await storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0))

        const streamingResults = storage.fetchFromTimestamp(streamId, 10, 3000)
        const results = await toArray(streamingResults)

        expect(results).toEqual([from1, from2, from3, from4, from5])
    })

    test('fetch messages starting from a message reference for a particular publisher', async () => {
        await storage.store(buildMsg(streamId, 10, 0, 0, 'publisher1'))
        await storage.store(buildMsg(streamId, 10, 1000, 0, 'publisher2'))
        await storage.store(buildMsg(streamId, 10, 2000, 0, 'publisher3'))
        await storage.store(buildMsg(streamId, 10, 3000, 0, 'publisher1'))
        const from2 = buildMsg(streamId, 10, 3000, 3, 'publisher1')
        await storage.store(from2)
        await storage.store(buildMsg(streamId, 10, 3000, 2, 'publisher2'))
        const from1 = buildMsg(streamId, 10, 3000, 1, 'publisher1')
        await storage.store(from1)
        await storage.store(buildMsg(streamId, 10, 3000, 1, 'publisher1', '2'))
        await storage.store(buildMsg(streamId, 10, 4000, 0, 'publisher3'))
        const from3 = buildMsg(streamId, 10, 8000, 0, 'publisher1')
        await storage.store(from3)
        await storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0, 'publisher1'))

        const streamingResults = storage.fetchFromMessageRefForPublisher(streamId, 10, new MessageRef(3000, 1), 'publisher1', '1')
        const results = await toArray(streamingResults)

        expect(results).toEqual([from1, from2, from3])
    })

    test('fetch messages between two message references for a particular publisher', async () => {
        await storage.store(buildMsg(streamId, 10, 0, 0, 'publisher1'))
        await storage.store(buildMsg(streamId, 10, 1500, 0, 'publisher1'))
        const range1 = buildMsg(streamId, 10, 2000, 0, 'publisher1')
        await storage.store(range1)
        await storage.store(buildMsg(streamId, 10, 2500, 0, 'publisher3'))
        const range2 = buildMsg(streamId, 10, 3000, 0, 'publisher1')
        await storage.store(range2)
        await storage.store(buildMsg(streamId, 10, 3000, 0, 'publisher1', '2'))
        await storage.store(buildMsg(streamId, 10, 3000, 3, 'publisher1'))
        const range4 = buildMsg(streamId, 10, 3000, 2, 'publisher1')
        await storage.store(range4)
        const range3 = buildMsg(streamId, 10, 3000, 1, 'publisher1')
        await storage.store(range3)
        await storage.store(buildMsg(streamId, 10, 8000, 0, 'publisher1'))
        await storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0, 'publisher1'))

        const streamingResults = storage.fetchBetweenMessageRefsForPublisher(
            streamId, 10, new MessageRef(1500, 3),
            new MessageRef(3000, 2), 'publisher1', '1',
        )
        const results = await toArray(streamingResults)

        expect(results).toEqual([range1, range2, range3, range4])
    })

    test('fetch messages in a timestamp range', async () => {
        await storage.store(buildMsg(streamId, 10, 0, 0))
        await storage.store(buildMsg(streamId, 10, 1000, 0))
        const range1 = buildMsg(streamId, 10, 2000, 0)
        await storage.store(range1)
        const range2 = buildMsg(streamId, 10, 2500, 0)
        await storage.store(range2)
        const range4 = buildMsg(streamId, 10, 2500, 2, 'publisher2')
        await storage.store(range4)
        const range3 = buildMsg(streamId, 10, 2500, 1)
        await storage.store(range3)
        const range5 = buildMsg(streamId, 10, 3000, 0)
        await storage.store(range5)
        await storage.store(buildMsg(streamId, 10, 4000, 0))
        await storage.store(buildMsg(streamId, 666, 2500, 0))
        await storage.store(buildMsg(`${streamId}-wrong`, 10, 3000, 0))

        const streamingResults = storage.fetchBetweenTimestamps(streamId, 10, 1500, 3500)
        const results = await toArray(streamingResults)

        expect(results).toEqual([range1, range2, range3, range4, range5])
    })
})
