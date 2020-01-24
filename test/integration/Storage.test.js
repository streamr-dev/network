const cassandra = require('cassandra-driver')
const toArray = require('stream-to-array')
const { StreamMessage, StreamMessageV31 } = require('streamr-client-protocol').MessageLayer
const { wait } = require('streamr-test-utils')

const { startCassandraStorage } = require('../../src/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

function buildMsg(
    streamId,
    streamPartition,
    timestamp,
    sequenceNumber,
    publisherId = 'publisher',
    msgChainId = '1',
    content = {}
) {
    return StreamMessage.create(
        [streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId],
        null,
        StreamMessage.CONTENT_TYPES.MESSAGE,
        StreamMessage.ENCRYPTION_TYPES.NONE,
        content,
        StreamMessage.SIGNATURE_TYPES.NONE,
        null,
    )
}

function buildEncryptedMsg(
    streamId,
    streamPartition,
    timestamp,
    sequenceNumber,
    publisherId = 'publisher',
    msgChainId = '1',
    content = 'ab3516983712fa4eb216a898ddd'
) {
    return new StreamMessageV31(
        [streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId],
        null,
        StreamMessage.CONTENT_TYPES.MESSAGE,
        StreamMessage.ENCRYPTION_TYPES.AES,
        content,
        StreamMessage.SIGNATURE_TYPES.NONE,
        null,
    )
}

describe.each([false, true])('Storage (isBatching=%s)', (isBatching) => {
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
        storage = await startCassandraStorage({
            contactPoints,
            localDataCenter,
            keyspace,
            isBatching
        })
        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
    })

    afterEach(async () => {
        await storage.close()
    })

    test('requestLast throws exception if limit is not strictly positive', async () => {
        expect(() => storage.requestLast(streamId, -1, 0)).toThrow()
        expect(() => storage.requestLast(streamId, 10, 0)).toThrow()
        expect(() => storage.requestLast(streamId, 10, -1)).toThrow()
    })

    test('requestFrom throws exception if from is not strictly positive', async () => {
        expect(() => storage.requestFrom(streamId, -10, 3000)).toThrow()
        expect(() => storage.requestFrom(streamId, 10, -3000)).toThrow()
    })

    test('requestFrom and requestLast not throwing exception if timestamp is zero', async () => {
        const a = storage.requestFrom(streamId, 0, 1)
        const resultsA = await toArray(a)
        expect(resultsA).toEqual([])

        const b = storage.requestLast(streamId, 0, 1)
        const resultsB = await toArray(b)
        expect(resultsB).toEqual([])
    })

    test('store messages into Cassandra', async () => {
        const data = {
            hello: 'world',
            value: 6,
        }
        const msg = buildMsg(streamId, 10, 1545144750494, 0, 'publisher', '1', data)
        await storage.store(msg)

        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE id = ? AND partition = 10', [
            streamId
        ])
        expect(result.rows.length).toEqual(1)
        expect(result.rows[0]).toEqual({
            id: streamId,
            partition: 10,
            ts: new Date(1545144750494),
            sequence_no: {
                high: 0,
                low: 0,
                unsigned: false,
            },
            publisher_id: 'publisher',
            msg_chain_id: '1',
            payload: Buffer.from(msg.serialize()),
        })
    })

    test('fetch last messages', async () => {
        const msg1 = buildMsg(streamId, 10, 3000, 2, 'publisher2')
        const msg2 = buildEncryptedMsg(streamId, 10, 3000, 3)
        const msg3 = buildEncryptedMsg(streamId, 10, 4000, 0)
        await Promise.all([
            storage.store(buildEncryptedMsg(streamId, 10, 0, 0)),
            storage.store(buildEncryptedMsg(streamId, 10, 1000, 0)),
            storage.store(buildMsg(streamId, 10, 2000, 0)),
            storage.store(buildMsg(streamId, 10, 3000, 0)),
            storage.store(msg2),
            storage.store(msg1),
            storage.store(buildMsg(streamId, 10, 3000, 1)),
            storage.store(msg3),
            storage.store(buildEncryptedMsg(streamId, 666, 8000, 0)),
            storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0))
        ])

        const streamingResults = storage.requestLast(streamId, 10, 3)
        const results = await toArray(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3])
    })

    test('fetch messages starting from a timestamp', async () => {
        const msg1 = buildMsg(streamId, 10, 3000, 0)
        const msg2 = buildMsg(streamId, 10, 3000, 1)
        const msg3 = buildEncryptedMsg(streamId, 10, 3000, 2, 'publisher', '2')
        const msg4 = buildEncryptedMsg(streamId, 10, 3000, 3)
        const msg5 = buildEncryptedMsg(streamId, 10, 4000, 0)
        await Promise.all([
            storage.store(buildMsg(streamId, 10, 0, 0)),
            storage.store(buildMsg(streamId, 10, 1000, 0)),
            storage.store(buildEncryptedMsg(streamId, 10, 2000, 0)),
            storage.store(msg1),
            storage.store(msg4),
            storage.store(msg3),
            storage.store(msg2),
            storage.store(msg5),
            storage.store(buildMsg(streamId, 666, 8000, 0)),
            storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0))
        ])

        const streamingResults = storage.requestFrom(streamId, 10, 3000)
        const results = await toArray(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
    })

    test('fetch messages starting from a timestamp,sequenceNo for a given publisher, msgChainId', async () => {
        const msg1 = buildEncryptedMsg(streamId, 10, 3000, 1, 'publisher1')
        const msg2 = buildEncryptedMsg(streamId, 10, 3000, 3, 'publisher1')
        const msg3 = buildEncryptedMsg(streamId, 10, 8000, 0, 'publisher1')
        await Promise.all([
            storage.store(buildEncryptedMsg(streamId, 10, 0, 0, 'publisher1')),
            storage.store(buildEncryptedMsg(streamId, 10, 1000, 0, 'publisher2')),
            storage.store(buildMsg(streamId, 10, 2000, 0, 'publisher3')),
            storage.store(buildMsg(streamId, 10, 3000, 0, 'publisher1')),
            storage.store(msg2),
            storage.store(buildEncryptedMsg(streamId, 10, 3000, 2, 'publisher2')),
            storage.store(msg1),
            storage.store(buildMsg(streamId, 10, 3000, 1, 'publisher1', '2')),
            storage.store(buildMsg(streamId, 10, 4000, 0, 'publisher3')),
            storage.store(msg3),
            storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0, 'publisher1', '1'))
        ])

        const streamingResults = storage.requestFrom(streamId, 10, 3000, 1, 'publisher1', '1')
        const results = await toArray(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3])
    })

    test('fetch messages in a timestamp range', async () => {
        const msg1 = buildMsg(streamId, 10, 2000, 0)
        const msg2 = buildMsg(streamId, 10, 2500, 0)
        const msg3 = buildEncryptedMsg(streamId, 10, 2500, 1)
        const msg4 = buildEncryptedMsg(streamId, 10, 2500, 2, 'publisher2')
        const msg5 = buildEncryptedMsg(streamId, 10, 3000, 0)
        await Promise.all([
            storage.store(buildMsg(streamId, 10, 0, 0)),
            storage.store(buildEncryptedMsg(streamId, 10, 1000, 0)),
            storage.store(msg1),
            storage.store(msg2),
            storage.store(msg4),
            storage.store(msg3),
            storage.store(msg5),
            storage.store(buildEncryptedMsg(streamId, 666, 2500, 0)),
            storage.store(buildMsg(streamId, 10, 4000, 0)),
            storage.store(buildMsg(`${streamId}-wrong`, 10, 3000, 0))
        ])

        const streamingResults = storage.requestRange(streamId, 10, 1500, undefined, 3500, undefined)
        const results = await toArray(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
    })

    test('fetch messages in a timestamp,seqeuenceNo range for a particular publisher, msgChainId', async () => {
        const msg1 = buildEncryptedMsg(streamId, 10, 2000, 0, 'publisher1')
        const msg2 = buildEncryptedMsg(streamId, 10, 3000, 0, 'publisher1')
        const msg3 = buildEncryptedMsg(streamId, 10, 3000, 1, 'publisher1')
        const msg4 = buildMsg(streamId, 10, 3000, 2, 'publisher1')
        await Promise.all([
            storage.store(buildMsg(streamId, 10, 0, 0, 'publisher1')),
            storage.store(buildMsg(streamId, 10, 1500, 0, 'publisher1')),
            storage.store(msg1),
            storage.store(buildMsg(streamId, 10, 2500, 0, 'publisher3')),
            storage.store(msg2),
            storage.store(buildMsg(streamId, 10, 3000, 0, 'publisher1', '2')),
            storage.store(buildMsg(streamId, 10, 3000, 3, 'publisher1')),
            storage.store(msg4),
            storage.store(msg3),
            storage.store(buildEncryptedMsg(streamId, 10, 8000, 0, 'publisher1')),
            storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0, 'publisher1'))
        ])

        const streamingResults = storage.requestRange(streamId, 10, 1500, 3, 3000, 2, 'publisher1', '1')
        const results = await toArray(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3, msg4])
    })
})
