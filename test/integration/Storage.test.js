const cassandra = require('cassandra-driver')
const toArray = require('stream-to-array')
const { StreamMessage, StreamMessageV30, MessageRef } = require('streamr-client-protocol').MessageLayer
const { startCassandraStorage } = require('../../src/Storage')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

function formObject(streamId, streamPartition, timestamp, sequenceNo, publisherId = 'publisher', msgChainId = '1', payload = {}) {
    return {
        streamId,
        streamPartition,
        timestamp,
        sequenceNo,
        publisherId,
        msgChainId,
        payload,
        signature: null,
        signatureType: null,
    }
}

function objectToStreamrMessage({
    streamId,
    streamPartition,
    timestamp,
    sequenceNo,
    publisherId,
    msgChainId,
    previousTimestamp,
    previousSequenceNo,
    payload,
    signatureType,
    signature,
}) {
    return new StreamMessageV30(
        [streamId, streamPartition, timestamp, sequenceNo, publisherId, msgChainId],
        previousTimestamp == null ? null : [previousTimestamp, previousSequenceNo],
        StreamMessage.CONTENT_TYPES.JSON, payload, signatureType, signature,
    )
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
        const msg = formObject(streamId, 10, 1545144750494, 0, 'publisher', '1', data)
        await storage.store(msg)

        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE id = ? AND partition = 10', [streamId])
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
            payload: Buffer.from(objectToStreamrMessage(msg).serialize()),
        })
    })

    test('fetch last messages', async () => {
        await storage.store(formObject(streamId, 10, 0, 0))
        await storage.store(formObject(streamId, 10, 1000, 0))
        await storage.store(formObject(streamId, 10, 2000, 0))
        await storage.store(formObject(streamId, 10, 3000, 0))
        await storage.store(formObject(streamId, 10, 3000, 3)) // 2nd
        await storage.store(formObject(streamId, 10, 3000, 2, 'publisher2')) // 1st
        await storage.store(formObject(streamId, 10, 3000, 1))
        await storage.store(formObject(streamId, 10, 4000, 0)) // 3rd
        await storage.store(formObject(streamId, 666, 8000, 0))
        await storage.store(formObject(`${streamId}-wrong`, 10, 8000, 0))

        const streamingResults = storage.requestLast(streamId, 10, 3)
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            formObject(streamId, 10, 3000, 2, 'publisher2'),
            formObject(streamId, 10, 3000, 3),
            formObject(streamId, 10, 4000, 0),
        ].map(objectToStreamrMessage))
    })

    test('fetch messages starting from a timestamp', async () => {
        await storage.store(formObject(streamId, 10, 0, 0))
        await storage.store(formObject(streamId, 10, 1000, 0))
        await storage.store(formObject(streamId, 10, 2000, 0))
        await storage.store(formObject(streamId, 10, 3000, 0)) // 1st
        await storage.store(formObject(streamId, 10, 3000, 3)) // 4th
        await storage.store(formObject(streamId, 10, 3000, 2, 'publisher', '2')) // 3rd
        await storage.store(formObject(streamId, 10, 3000, 1)) // 2nd
        await storage.store(formObject(streamId, 10, 4000, 0)) // 5th
        await storage.store(formObject(streamId, 666, 8000, 0))
        await storage.store(formObject(`${streamId}-wrong`, 10, 8000, 0))

        const streamingResults = storage.requestFrom(streamId, 10, 3000)
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            formObject(streamId, 10, 3000, 0),
            formObject(streamId, 10, 3000, 1),
            formObject(streamId, 10, 3000, 2, 'publisher', '2'),
            formObject(streamId, 10, 3000, 3),
            formObject(streamId, 10, 4000, 0),
        ].map(objectToStreamrMessage))
    })

    test('fetch messages starting from a message reference for a particular publisher', async () => {
        await storage.store(formObject(streamId, 10, 0, 0, 'publisher1'))
        await storage.store(formObject(streamId, 10, 1000, 0, 'publisher2'))
        await storage.store(formObject(streamId, 10, 2000, 0, 'publisher3'))
        await storage.store(formObject(streamId, 10, 3000, 0, 'publisher1'))
        await storage.store(formObject(streamId, 10, 3000, 3, 'publisher1')) // 2nd
        await storage.store(formObject(streamId, 10, 3000, 2, 'publisher2'))
        await storage.store(formObject(streamId, 10, 3000, 1, 'publisher1')) // 1st
        await storage.store(formObject(streamId, 10, 3000, 1, 'publisher1', '2'))
        await storage.store(formObject(streamId, 10, 4000, 0, 'publisher3'))
        await storage.store(formObject(streamId, 10, 8000, 0, 'publisher1')) // 3rd
        await storage.store(formObject(`${streamId}-wrong`, 10, 8000, 0, 'publisher1'))

        const streamingResults = storage.requestFrom(streamId, 10, 3000, 1, 'publisher1', '1')
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            formObject(streamId, 10, 3000, 1, 'publisher1'),
            formObject(streamId, 10, 3000, 3, 'publisher1'),
            formObject(streamId, 10, 8000, 0, 'publisher1'),
        ].map(objectToStreamrMessage))
    })

    test('fetch messages between two message references for a particular publisher', async () => {
        await storage.store(formObject(streamId, 10, 0, 0, 'publisher1'))
        await storage.store(formObject(streamId, 10, 1500, 0, 'publisher1'))
        await storage.store(formObject(streamId, 10, 2000, 0, 'publisher1')) // 1st
        await storage.store(formObject(streamId, 10, 2500, 0, 'publisher3'))
        await storage.store(formObject(streamId, 10, 3000, 0, 'publisher1')) // 2nd
        await storage.store(formObject(streamId, 10, 3000, 0, 'publisher1', '2'))
        await storage.store(formObject(streamId, 10, 3000, 3, 'publisher1'))
        await storage.store(formObject(streamId, 10, 3000, 2, 'publisher1')) // 4th
        await storage.store(formObject(streamId, 10, 3000, 1, 'publisher1')) // 3rd
        await storage.store(formObject(streamId, 10, 8000, 0, 'publisher1'))
        await storage.store(formObject(`${streamId}-wrong`, 10, 8000, 0, 'publisher1'))

        const streamingResults = storage.requestRange(streamId, 10, 1500, 3, 3000, 2, 'publisher1', '1')
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            formObject(streamId, 10, 2000, 0, 'publisher1'),
            formObject(streamId, 10, 3000, 0, 'publisher1'),
            formObject(streamId, 10, 3000, 1, 'publisher1'),
            formObject(streamId, 10, 3000, 2, 'publisher1'),
        ].map(objectToStreamrMessage))
    })

    test('fetch messages in a timestamp range', async () => {
        await storage.store(formObject(streamId, 10, 0, 0))
        await storage.store(formObject(streamId, 10, 1000, 0))
        await storage.store(formObject(streamId, 10, 2000, 0)) // 1st
        await storage.store(formObject(streamId, 10, 2500, 0)) // 2nd
        await storage.store(formObject(streamId, 10, 2500, 2, 'publisher2')) // 4th
        await storage.store(formObject(streamId, 10, 2500, 1)) // 3rd
        await storage.store(formObject(streamId, 10, 3000, 0)) // 5th
        await storage.store(formObject(streamId, 10, 4000, 0))
        await storage.store(formObject(streamId, 666, 2500, 0))
        await storage.store(formObject(`${streamId}-wrong`, 10, 3000, 0))

        const streamingResults = storage.requestRange(streamId, 10, 1500, null, 3500, null)
        const results = await toArray(streamingResults)

        expect(results).toEqual([
            formObject(streamId, 10, 2000, 0),
            formObject(streamId, 10, 2500, 0),
            formObject(streamId, 10, 2500, 1),
            formObject(streamId, 10, 2500, 2, 'publisher2'),
            formObject(streamId, 10, 3000, 0),
        ].map(objectToStreamrMessage))
    })
})
