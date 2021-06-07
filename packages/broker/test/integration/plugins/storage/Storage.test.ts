import { Client } from 'cassandra-driver'
import toArray from 'stream-to-array'
import { Protocol } from 'streamr-network'
import { Storage } from '../../../../src/plugins/storage/Storage'
import { startCassandraStorage } from '../../../../src/plugins/storage/Storage'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'

const { StreamMessage, MessageIDStrict } = Protocol.MessageLayer

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'
const MAX_BUCKET_MESSAGE_COUNT = 20

function buildMsg(
    streamId: string,
    streamPartition: number,
    timestamp: number,
    sequenceNumber: number,
    publisherId = 'publisher',
    msgChainId = '1',
    content: any = {}
) {
    return new StreamMessage({
        messageId: new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId),
        content: JSON.stringify(content)
    })
}

function buildEncryptedMsg(
    streamId: string,
    streamPartition: number,
    timestamp: number,
    sequenceNumber: number,
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

const storeMockMessages = async (streamId: string, streamPartition: number, minTimestamp: number, maxTimestamp: number, count: number, storage: Storage) => {
    const storePromises = []
    for (let i = 0; i < count; i++) {
        const timestamp = minTimestamp + Math.floor((i / (count - 1)) * (maxTimestamp - minTimestamp))
        const msg = buildMsg(streamId, streamPartition, timestamp, 0, 'publisher1')
        storePromises.push(storage.store(msg))
    }
    return Promise.all(storePromises)
}

describe('Storage', () => {
    let storage: Storage
    let streamId: string
    let cassandraClient: Client
    let streamIdx = 1

    beforeAll(async () => {
        cassandraClient = new Client({
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
            opts: {
                maxBucketRecords: MAX_BUCKET_MESSAGE_COUNT,
                checkFullBucketsTimeout: 100,
                storeBucketsTimeout: 100,
                bucketKeepAliveSeconds: 1
            }
        })
        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
    })

    afterEach(async () => {
        await storage.close()
    })

    test('requestFrom not throwing exception if timestamp is zero', async () => {
        const a = storage.requestFrom(streamId, 0, 0, 0, null)
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

    describe('fetch messages starting from a timestamp', () => {

        test('happy path', async () => {
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

            const streamingResults = storage.requestFrom(streamId, 10, 3000, 0, null)
            const results = await toArray(streamingResults)

            expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
        })

    })

    describe('fetch messages within timestamp range', () => {

        test('happy path', async () => {
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

            const streamingResults = storage.requestRange(streamId, 10, 1500, 0, 3500, 0, null, null)
            const results = await toArray(streamingResults)

            expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
        })

        test('only one message', async () => {
            const msg = buildMsg(streamId, 10, 2000, 0)
            await storage.store(msg)
            const streamingResults = storage.requestRange(streamId, 10, 1500, 0, 3500, 0, null, null)
            const results = await toArray(streamingResults)
            expect(results).toEqual([msg])
        })

        test('with sequenceNo, publisher and msgChainId', async () => {
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

    test('multiple buckets', async () => {
        const messageCount = 3 * MAX_BUCKET_MESSAGE_COUNT
        await storeMockMessages(streamId, 777, 123000000, 456000000, messageCount, storage)

        // get all
        const streamingResults1 = storage.requestRange(streamId, 777, 100000000, 0, 555000000, 0, null, null)
        const results1 = await toArray(streamingResults1)
        expect(results1.length).toEqual(messageCount)

        // no messages in range (ignorable messages before range)
        const streamingResults2 = storage.requestRange(streamId, 777, 460000000, 0, 470000000, 0, null, null)
        const results2 = await toArray(streamingResults2)
        expect(results2).toEqual([])

        // no messages in range (ignorable messages after range)
        const streamingResults3 = storage.requestRange(streamId, 777, 100000000, 0, 110000000, 0, null, null)
        const results3 = await toArray(streamingResults3)
        expect(results3).toEqual([])
    }, 20000)

    describe('fast big stream', () => {
        let storedStreamId: string
        const NUM_MESSAGES = 1000

        beforeEach(async () => {
            // slow message setup: run this once
            // capture first streamId as storedStreamId, use that for these tests
            if (storedStreamId) { return }
            storedStreamId = streamId
            const storePromises = []
            for (let i = 0; i < NUM_MESSAGES; i++) {
                const msg = buildMsg(storedStreamId, 0, (i + 1) * 1000, i, 'publisher1')
                storePromises.push(storage.store(msg))
            }
            await Promise.all(storePromises)
        }, 30000)

        it('can requestLast', async () => {
            const streamingResults = storage.requestLast(storedStreamId, 0, NUM_MESSAGES)
            const results = await toArray(streamingResults)
            expect(results.length).toEqual(1000)
        }, 20000)

        it('can requestFrom', async () => {
            const streamingResults = storage.requestFrom(storedStreamId, 0, NUM_MESSAGES, 0, null)
            const results = await toArray(streamingResults)
            expect(results.length).toEqual(1000)
        }, 20000)
    })

    describe('stream details', () => {

        test('getFirstMessageInStream', async () => {
            const msg1 = buildMsg(streamId, 10, 2000, 3)
            const msg2 = buildMsg(streamId, 10, 3000, 2, 'publisher2')
            const msg3 = buildMsg(streamId, 10, 4000, 0)

            await storage.store(msg1)
            await storage.store(msg2)
            await storage.store(msg3)

            const ts = await storage.getFirstMessageTimestampInStream(streamId, 10)

            expect(ts.getTime()).toEqual(2000)
        })

        test('getLastMessageTimestampInStream', async () => {
            const msg1 = buildMsg(streamId, 10, 2000, 3)
            const msg2 = buildMsg(streamId, 10, 3000, 2, 'publisher2')
            const msg3 = buildMsg(streamId, 10, 4000, 0)

            await storage.store(msg1)
            await storage.store(msg2)
            await storage.store(msg3)

            const ts = await storage.getLastMessageTimestampInStream(streamId, 10)

            expect(ts.getTime()).toEqual(4000)
        })

        test('getNumberOfMessagesInStream', async () => {
            const msg1 = buildMsg(streamId, 10, 2000, 3)
            const msg2 = buildMsg(streamId, 10, 3000, 2, 'publisher2')
            const msg3 = buildMsg(streamId, 10, 4000, 0)

            await storage.store(msg1)
            await storage.store(msg2)
            await storage.store(msg3)

            const count = await storage.getNumberOfMessagesInStream(streamId, 10)

            expect(count).toEqual(3)
        })

        test('getTotalBytesInStream', async () => {
            const msg1 = buildMsg(streamId, 10, 2000, 3)
            const msg2 = buildMsg(streamId, 10, 3000, 2, 'publisher2')
            const msg3 = buildMsg(streamId, 10, 4000, 0)

            await storage.store(msg1)
            await storage.store(msg2)
            await storage.store(msg3)

            const bytes = await storage.getTotalBytesInStream(streamId, 10)

            expect(bytes).toBeGreaterThan(0)
        })
    })
})
