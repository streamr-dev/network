import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage,
    convertBytesToStreamMessage,
    convertStreamMessageToBytes
} from '@streamr/sdk'
import { hexToBinary, toStreamID, UserID, utf8ToBinary } from '@streamr/utils'
import { Client } from 'cassandra-driver'
import { randomFillSync } from 'crypto'
import { Readable } from 'stream'
import toArray from 'stream-to-array'
import { Storage, startCassandraStorage } from '../../../../src/plugins/storage/Storage'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'
import { randomUserId } from '@streamr/test-utils'

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'
const MAX_BUCKET_MESSAGE_COUNT = 20

const publisherZero = randomUserId()
const publisherOne = randomUserId()
const publisherTwo = randomUserId()
const publisherThree = randomUserId()

// eslint-disable-next-line jest/no-export
export function buildMsg({
    streamId,
    streamPartition,
    timestamp,
    sequenceNumber,
    publisherId = publisherZero,
    msgChainId = '1',
    content = {}
}: {
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId?: UserID
    msgChainId?: string
    content?: any
}): StreamMessage {
    return new StreamMessage({
        messageId: new MessageID(
            toStreamID(streamId),
            streamPartition,
            timestamp,
            sequenceNumber,
            publisherId,
            msgChainId
        ),
        content: Buffer.from(utf8ToBinary(JSON.stringify(content))),
        signature: Buffer.from(hexToBinary('0x1234')),
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1
    })
}

function buildEncryptedMsg({
    streamId,
    streamPartition,
    timestamp,
    sequenceNumber,
    publisherId = publisherZero,
    msgChainId = '1'
}: {
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId?: UserID
    msgChainId?: string
}) {
    return new StreamMessage({
        messageId: new MessageID(
            toStreamID(streamId),
            streamPartition,
            timestamp,
            sequenceNumber,
            publisherId,
            msgChainId
        ),
        content: Buffer.from(new Uint8Array([1, 2, 3])),
        encryptionType: EncryptionType.AES,
        signature: Buffer.from(hexToBinary('0x1234')),
        groupKeyId: 'groupKeyId',
        contentType: ContentType.JSON,
        signatureType: SignatureType.SECP256K1
    })
}

async function storeMockMessages({
    streamId,
    streamPartition,
    minTimestamp,
    maxTimestamp,
    count,
    storage
}: {
    streamId: string
    streamPartition: number
    minTimestamp: number
    maxTimestamp: number
    count: number
    storage: Storage
}) {
    const storePromises = []
    for (let i = 0; i < count; i++) {
        const timestamp = minTimestamp + Math.floor((i / (count - 1)) * (maxTimestamp - minTimestamp))
        const msg = buildMsg({ streamId, streamPartition, timestamp, sequenceNumber: 0, publisherId: publisherOne })
        storePromises.push(storage.store(msg))
    }
    return Promise.all(storePromises)
}

async function readStreamToEnd(streamingResults: Readable): Promise<StreamMessage[]> {
    const messages: Uint8Array[] = await toArray(streamingResults)
    return messages.map(convertBytesToStreamMessage)
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
            keyspace
        })
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
    })

    afterAll(async () => {
        await Promise.allSettled([storage.close(), cassandraClient.shutdown()])
    })

    beforeEach(async () => {
        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
    })

    test('requestFrom not throwing exception if timestamp is zero', async () => {
        const a = storage.requestFrom(streamId, 0, 0, 0, undefined)
        const resultsA = await readStreamToEnd(a)
        expect(resultsA).toEqual([])
    })

    test('store messages into Cassandra', async () => {
        const data = {
            hello: 'world',
            value: 6
        }
        const msg = buildMsg({
            streamId,
            streamPartition: 10,
            timestamp: 1545144750494,
            sequenceNumber: 0,
            publisherId: publisherZero,
            msgChainId: '1',
            content: data
        })
        await storage.store(msg)

        const result = await cassandraClient.execute(
            'SELECT * FROM stream_data WHERE stream_id = ? AND partition = 10 ALLOW FILTERING',
            [streamId]
        )

        const { stream_id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload } = result.first()

        expect(result.first().bucket_id).not.toBeUndefined()
        expect({
            stream_id,
            partition,
            ts,
            sequence_no,
            publisher_id,
            msg_chain_id,
            payload
        }).toEqual({
            stream_id: streamId,
            partition: 10,
            ts: new Date(1545144750494),
            sequence_no: 0,
            publisher_id: publisherZero,
            msg_chain_id: '1',
            payload: Buffer.from(convertStreamMessageToBytes(msg))
        })
    })

    test('fetch last messages', async () => {
        const msg1 = buildMsg({
            streamId,
            streamPartition: 10,
            timestamp: 3000,
            sequenceNumber: 2,
            publisherId: publisherTwo
        })
        const msg2 = buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 3 })
        const msg3 = buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 4000, sequenceNumber: 0 })

        await Promise.all([
            storage.store(buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 0, sequenceNumber: 0 })),
            storage.store(buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 1000, sequenceNumber: 0 })),
            storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 2000, sequenceNumber: 0 })),
            storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 0 })),
            storage.store(msg2),
            storage.store(msg1),
            storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 1 })),
            storage.store(msg3),
            storage.store(buildEncryptedMsg({ streamId, streamPartition: 666, timestamp: 8000, sequenceNumber: 0 })),
            storage.store(
                buildMsg({ streamId: `${streamId}-wrong`, streamPartition: 10, timestamp: 8000, sequenceNumber: 0 })
            )
        ])

        const streamingResults = storage.requestLast(streamId, 10, 3)
        const results = await readStreamToEnd(streamingResults)

        expect(results).toEqual([msg1, msg2, msg3])
    })

    describe('fetch messages starting from a timestamp', () => {
        test('happy path', async () => {
            const msg1 = buildMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 6 })
            const msg2 = buildMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 7 })
            const msg3 = buildEncryptedMsg({
                streamId,
                streamPartition: 10,
                timestamp: 3000,
                sequenceNumber: 8,
                publisherId: publisherZero,
                msgChainId: '2'
            })
            const msg4 = buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 9 })
            const msg5 = buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 4000, sequenceNumber: 0 })

            await Promise.all([
                storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 0, sequenceNumber: 0 })),
                storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 1000, sequenceNumber: 0 })),
                storage.store(buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 2000, sequenceNumber: 0 })),
                storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 3000, sequenceNumber: 5 })),
                storage.store(msg1),
                storage.store(msg4),
                storage.store(msg3),
                storage.store(msg2),
                storage.store(msg5),
                storage.store(buildMsg({ streamId, streamPartition: 666, timestamp: 8000, sequenceNumber: 0 })),
                storage.store(
                    buildMsg({ streamId: `${streamId}-wrong`, streamPartition: 10, timestamp: 8000, sequenceNumber: 0 })
                )
            ])

            const streamingResults = storage.requestFrom(streamId, 10, 3000, 6, undefined)
            const results = await readStreamToEnd(streamingResults)

            expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
        })
    })

    describe('fetch messages within timestamp range', () => {
        test('happy path', async () => {
            const msg1 = buildMsg({ streamId, streamPartition: 10, timestamp: 1500, sequenceNumber: 5 })
            const msg2 = buildMsg({ streamId, streamPartition: 10, timestamp: 1500, sequenceNumber: 6 })
            const msg3 = buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 2500, sequenceNumber: 1 })
            const msg4 = buildEncryptedMsg({
                streamId,
                streamPartition: 10,
                timestamp: 2500,
                sequenceNumber: 2,
                publisherId: publisherTwo
            })
            const msg5 = buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 3500, sequenceNumber: 4 })

            await Promise.all([
                storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 0, sequenceNumber: 0 })),
                storage.store(buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 1000, sequenceNumber: 0 })),
                storage.store(buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 1500, sequenceNumber: 4 })),
                storage.store(msg1),
                storage.store(msg2),
                storage.store(msg4),
                storage.store(msg3),
                storage.store(msg5),
                storage.store(
                    buildEncryptedMsg({ streamId, streamPartition: 666, timestamp: 2500, sequenceNumber: 0 })
                ),
                storage.store(buildEncryptedMsg({ streamId, streamPartition: 10, timestamp: 3500, sequenceNumber: 5 })),
                storage.store(buildMsg({ streamId, streamPartition: 10, timestamp: 4000, sequenceNumber: 0 })),
                storage.store(
                    buildMsg({ streamId: `${streamId}-wrong`, streamPartition: 10, timestamp: 3000, sequenceNumber: 0 })
                )
            ])

            const streamingResults = storage.requestRange(streamId, 10, 1500, 5, 3500, 4, undefined, undefined)
            const results = await readStreamToEnd(streamingResults)

            expect(results).toEqual([msg1, msg2, msg3, msg4, msg5])
        })

        test('only one message', async () => {
            const msg = buildMsg({ streamId, streamPartition: 10, timestamp: 2000, sequenceNumber: 0 })
            await storage.store(msg)
            const streamingResults = storage.requestRange(streamId, 10, 1500, 0, 3500, 0, undefined, undefined)
            const results = await readStreamToEnd(streamingResults)
            expect(results).toEqual([msg])
        })

        test('with sequenceNo, publisher and msgChainId', async () => {
            const msg1 = buildEncryptedMsg({
                streamId,
                streamPartition: 10,
                timestamp: 2000,
                sequenceNumber: 0,
                publisherId: publisherOne
            })
            const msg2 = buildEncryptedMsg({
                streamId,
                streamPartition: 10,
                timestamp: 3000,
                sequenceNumber: 0,
                publisherId: publisherOne
            })
            const msg3 = buildEncryptedMsg({
                streamId,
                streamPartition: 10,
                timestamp: 3000,
                sequenceNumber: 1,
                publisherId: publisherOne
            })
            const msg4 = buildMsg({
                streamId,
                streamPartition: 10,
                timestamp: 3000,
                sequenceNumber: 2,
                publisherId: publisherOne
            })

            await Promise.all([
                storage.store(
                    buildMsg({
                        streamId,
                        streamPartition: 10,
                        timestamp: 0,
                        sequenceNumber: 0,
                        publisherId: publisherOne
                    })
                ),
                storage.store(
                    buildMsg({
                        streamId,
                        streamPartition: 10,
                        timestamp: 1500,
                        sequenceNumber: 0,
                        publisherId: publisherOne
                    })
                ),
                storage.store(msg1),
                storage.store(
                    buildMsg({
                        streamId,
                        streamPartition: 10,
                        timestamp: 2500,
                        sequenceNumber: 0,
                        publisherId: publisherThree
                    })
                ),
                storage.store(msg2),
                storage.store(
                    buildMsg({
                        streamId,
                        streamPartition: 10,
                        timestamp: 3000,
                        sequenceNumber: 0,
                        publisherId: publisherOne,
                        msgChainId: '2'
                    })
                ),
                storage.store(
                    buildMsg({
                        streamId,
                        streamPartition: 10,
                        timestamp: 3000,
                        sequenceNumber: 3,
                        publisherId: publisherOne
                    })
                ),
                storage.store(msg4),
                storage.store(msg3),
                storage.store(
                    buildEncryptedMsg({
                        streamId,
                        streamPartition: 10,
                        timestamp: 8000,
                        sequenceNumber: 0,
                        publisherId: publisherOne
                    })
                ),
                storage.store(
                    buildMsg({
                        streamId: `${streamId}-wrong`,
                        streamPartition: 10,
                        timestamp: 8000,
                        sequenceNumber: 0,
                        publisherId: publisherOne
                    })
                )
            ])

            const streamingResults = storage.requestRange(streamId, 10, 1500, 3, 3000, 2, publisherOne, '1')
            const results = await readStreamToEnd(streamingResults)

            expect(results).toEqual([msg1, msg2, msg3, msg4])
        })
    })

    test('multiple buckets', async () => {
        const messageCount = 3 * MAX_BUCKET_MESSAGE_COUNT
        await storeMockMessages({
            streamId,
            streamPartition: 777,
            minTimestamp: 123000000,
            maxTimestamp: 456000000,
            count: messageCount,
            storage
        })

        // get all
        const streamingResults1 = storage.requestRange(streamId, 777, 100000000, 0, 555000000, 0, undefined, undefined)
        const results1 = await readStreamToEnd(streamingResults1)
        expect(results1.length).toEqual(messageCount)

        // no messages in range (ignorable messages before range)
        const streamingResults2 = storage.requestRange(streamId, 777, 460000000, 0, 470000000, 0, undefined, undefined)
        const results2 = await readStreamToEnd(streamingResults2)
        expect(results2).toEqual([])

        // no messages in range (ignorable messages after range)
        const streamingResults3 = storage.requestRange(streamId, 777, 100000000, 0, 110000000, 0, undefined, undefined)
        const results3 = await readStreamToEnd(streamingResults3)
        expect(results3).toEqual([])
    }, 20000)

    // This test proves that NET-350 is still an issue
    describe.skip('messages pushed in randomized order', () => {
        const NUM_MESSAGES = 100
        const MESSAGE_SIZE = 1000

        let beforeEachWasRunAlready = false
        beforeEach(async () => {
            if (beforeEachWasRunAlready) {
                return
            }
            beforeEachWasRunAlready = true
            const messages = []
            const randomBuffer = Buffer.alloc(MESSAGE_SIZE)
            for (let i = 0; i < NUM_MESSAGES; i++) {
                randomFillSync(randomBuffer)
                const msg = buildMsg({
                    streamId,
                    streamPartition: 0,
                    timestamp: (i + 1) * 1000,
                    sequenceNumber: i,
                    publisherId: publisherOne,
                    content: randomBuffer.toString('hex')
                })
                messages.push(msg)
            }
            const storePromises = []
            for (const msg of messages.sort(() => 0.5 - Math.random())) {
                // biased, "semi-random" shuffle
                storePromises.push(storage.store(msg))
            }
            const firstQuarter = Math.floor(storePromises.length * (1 / 4))
            const halfPoint = Math.floor(storePromises.length * (2 / 4))
            const lastQuarter = Math.floor(storePromises.length * (3 / 4))
            await Promise.all(storePromises.slice(0, firstQuarter))
            await Promise.all(storePromises.slice(firstQuarter, halfPoint))
            await Promise.all(storePromises.slice(halfPoint, lastQuarter))
            await Promise.all(storePromises.slice(lastQuarter))
        }, 30 * 1000)

        it('requestLast correctly returns last 10 messages', async () => {
            const streamingResults = storage.requestLast(streamId, 0, 10)
            const results = await readStreamToEnd(streamingResults)
            expect(results.map((msg) => msg.messageId.sequenceNumber)).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99])
        })

        it('requestFrom correctly returns messages', async () => {
            const streamingResults = storage.requestFrom(streamId, 0, 91000, 0)
            const results = await readStreamToEnd(streamingResults)
            expect(results.map((msg) => msg.messageId.sequenceNumber)).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99])
        })

        it('requestRange correctly returns range of messages', async () => {
            const streamingResults = storage.requestRange(streamId, 0, 41000, 0, 50000, 0, undefined, undefined)
            const results = await readStreamToEnd(streamingResults)
            expect(results.map((msg) => msg.messageId.sequenceNumber)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49])
        })
    })

    describe('stream details', () => {
        let streamId: string
        beforeAll(async () => {
            streamId = `stream-id-details-${Date.now()}-${streamIdx}`
            const msg1 = buildMsg({ streamId, streamPartition: 10, timestamp: 2000, sequenceNumber: 3 })
            const msg2 = buildMsg({
                streamId,
                streamPartition: 10,
                timestamp: 3000,
                sequenceNumber: 2,
                publisherId: publisherTwo
            })
            const msg3 = buildMsg({ streamId, streamPartition: 10, timestamp: 4000, sequenceNumber: 0 })
            await storage.store(msg1)
            await storage.store(msg2)
            await storage.store(msg3)
        })

        test('getFirstMessageInStream', async () => {
            const ts = await storage.getFirstMessageTimestampInStream(streamId, 10)
            expect(ts).toEqual(2000)
        })

        test('getLastMessageTimestampInStream', async () => {
            const ts = await storage.getLastMessageTimestampInStream(streamId, 10)
            expect(ts).toEqual(4000)
        })

        test('getNumberOfMessagesInStream', async () => {
            const count = await storage.getNumberOfMessagesInStream(streamId, 10)
            expect(count).toEqual(3)
        })

        test('getTotalBytesInStream', async () => {
            const bytes = await storage.getTotalBytesInStream(streamId, 10)
            expect(bytes).toBeGreaterThan(0)
        })
    })
})
