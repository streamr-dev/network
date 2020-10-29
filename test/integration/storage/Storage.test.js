const cassandra = require('cassandra-driver')
const toArray = require('stream-to-array')
const { StreamMessage, MessageIDStrict } = require('streamr-network').Protocol.MessageLayer

const { startCassandraStorage } = require('../../../src/storage/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

function buildMsg(
    streamId,
    streamPartition,
    timestamp,
    sequenceNumber,
    publisherId = 'publisher',
    msgChainId = '1',
    content = {}
) {
    return new StreamMessage({
        messageId: new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId),
        content: JSON.stringify(content)
    })
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
    return new StreamMessage({
        messageId: new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId),
        content,
        encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
    })
}

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
        storage = await startCassandraStorage({
            contactPoints,
            localDataCenter,
            keyspace,
        })
        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
    })

    afterEach(async () => {
        await storage.close()
    })

    test('requestLast not throwing exception if no buckets found', async () => {
        const b = storage.requestLast(streamId, 777, 10)
        const resultsB = await toArray(b)
        expect(resultsB).toEqual([])
    })

    test('requestFrom not throwing exception if no buckets found', async () => {
        const a = storage.requestFrom(streamId, 777, 1)
        const resultsB = await toArray(a)
        expect(resultsB).toEqual([])
    })

    test('requestFrom not throwing exception if timestamp is zero', async () => {
        const a = storage.requestFrom(streamId, 0, 0)
        const resultsA = await toArray(a)
        expect(resultsA).toEqual([])
    })

    test('store messages into Cassandra', async () => {
        const data = {
            hello: 'world',
            value: 6,
        }
        const msg = buildMsg(streamId, 10, 1545144750494, 0, 'publisher', '1', data)
        await storage.store(msg)

        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE stream_id = ? AND partition = 10 ALLOW FILTERING', [
            streamId
        ])

        const {
            // eslint-disable-next-line camelcase
            stream_id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload
        } = result.first()

        expect(result.first().bucket_id).not.toBeUndefined()
        expect({
            stream_id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload
        }).toEqual({
            stream_id: streamId,
            partition: 10,
            ts: new Date(1545144750494),
            sequence_no: 0,
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
            storage.store(buildMsg(`${streamId}-wrong`, 10, 8000, 0)),
        ])

        const streamingResults = storage.requestFrom(streamId, 10, 3000)
        const results = await toArray(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
    })

    test('fetch messages starting from a timestamp, sequenceNo for a given publisher, msgChainId', async () => {
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
            storage.store(buildMsg(`${streamId}-wrong`, 10, 3000, 0)),
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

    test('requestLast fast big stream', async () => {
        const storePromises = []
        for (let i = 0; i < 1000; i++) {
            const msg = buildMsg(streamId, 0, (i + 1) * 1000, i, 'publisher1')
            storePromises.push(storage.store(msg))
        }

        await Promise.all(storePromises)

        const streamingResults = storage.requestLast(streamId, 0, 1000)
        const results = await toArray(streamingResults)

        expect(results.length).toEqual(1000)
    })

    test('requestFrom fast big stream', async () => {
        const storePromises = []
        for (let i = 0; i < 1000; i++) {
            const msg = buildMsg(streamId, 0, (i + 1) * 1000, i, 'publisher1')
            storePromises.push(storage.store(msg))
        }

        await Promise.all(storePromises)

        const streamingResults = storage.requestFrom(streamId, 0, 1000)
        const results = await toArray(streamingResults)

        expect(results.length).toEqual(1000)
    })
})
