const { MessageLayer } = require('streamr-client-protocol')

const MemoryStorage = require('../../src/storage/MemoryStorage')
const { StreamIdAndPartition } = require('../../src/identifiers')

const { StreamMessage, MessageID, MessageRef } = MessageLayer

let streamMessages = []
const MAX = 10
const streamIdInit = 'stream-1'
const streamIdInit2 = 'stream-2'
const streamObj = new StreamIdAndPartition(streamIdInit, 0)
const streamObj2 = new StreamIdAndPartition(streamIdInit2, 0)

const { id, partition } = streamObj
let memoryStorage

for (let i = 0; i < MAX; i++) {
    const streamMessage = new StreamMessage({
        messageId: new MessageID(id, partition, i, 0, 'publisher-id', 'sessionId'),
        prevMsgRef: i === 0 ? null : new MessageRef(i - 1, 0),
        content: {
            messageNo: i
        },
    })
    streamMessages.push(streamMessage)
}

const shuffleArray = (arr) => arr
    .map((a) => [Math.random(), a])
    .sort((a, b) => a[0] - b[0])
    .map((a) => a[1])

describe('test mem storage', () => {
    beforeEach(() => {
        memoryStorage = new MemoryStorage()

        streamMessages = shuffleArray(streamMessages)

        for (let i = 0; i < MAX; i++) {
            const streamMessage = streamMessages[i]

            const { messageId } = streamMessage
            const previousMessageReference = streamMessage.prevMsgRef

            memoryStorage.store({
                streamId: messageId.streamId,
                streamPartition: messageId.streamPartition,
                timestamp: messageId.timestamp,
                sequenceNo: messageId.sequenceNumber,
                publisherId: messageId.publisherId,
                msgChainId: messageId.msgChainId,
                previousTimestamp: previousMessageReference ? previousMessageReference.timestamp : null,
                previousSequenceNo: previousMessageReference ? previousMessageReference.sequenceNumber : null,
                data: streamMessage.getParsedContent(),
                signature: streamMessage.signature,
                signatureType: streamMessage.signatureType
            })
        }
    })

    test('store data in memory storage', () => {
        expect(memoryStorage.hasStreamKey(id, partition)).toBeTruthy()
        expect(memoryStorage.size(id, partition)).toBe(MAX)
        expect(memoryStorage.hasStreamKey(streamObj2.id, streamObj2.partition)).toBeFalsy()
    })

    test('test requestLast', (done) => {
        const lastRecords = memoryStorage.requestLast(id, partition, 2)

        const arr = []
        lastRecords.on('data', (object) => arr.push(object))

        lastRecords.on('end', () => {
            expect(arr.length).toEqual(2)
            expect(arr).toEqual([
                {
                    data: {
                        messageNo: 8
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 7,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 8
                },
                {
                    data: {
                        messageNo: 9
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 8,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 9
                }
            ])
            done()
        })
    })

    test('test last 0 and -1', () => {
        try {
            memoryStorage.requestLast(id, partition, 0)
        } catch (error) {
            expect(error).toEqual(new TypeError('number is not an positive integer'))
        }

        try {
            memoryStorage.requestLast(id, partition, -1)
        } catch (error) {
            expect(error).toEqual(new TypeError('number is not an positive integer'))
        }
    })

    test('test requestFrom', (done) => {
        const FROM_TIME = 8
        const fromStream = memoryStorage.requestFrom(id, partition, FROM_TIME, 0, 'publisher-id', 'sessionId')

        const arr = []
        fromStream.on('data', (object) => arr.push(object))

        fromStream.on('end', () => {
            expect(arr.length).toEqual(2)

            expect(arr).toEqual([
                {
                    data: {
                        messageNo: 8
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 7,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 8
                },
                {
                    data: {
                        messageNo: 9
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 8,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 9
                }
            ])
            done()
        })
    })

    test('test requestRange', (done) => {
        const FROM_TIME = 3
        const TO_TIME = 5
        const rangeStream = memoryStorage.requestRange(id, partition, FROM_TIME, TO_TIME, 0, 0, 'publisher-id', 'sessionId')

        const arr = []
        rangeStream.on('data', (object) => arr.push(object))

        rangeStream.on('end', () => {
            expect(arr.length).toEqual(3)
            expect(arr).toEqual([
                {
                    data: {
                        messageNo: 3
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 2,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 3
                },
                {
                    data: {
                        messageNo: 4
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 3,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 4
                },
                {
                    data: {
                        messageNo: 5
                    },
                    msgChainId: 'sessionId',
                    previousSequenceNo: 0,
                    previousTimestamp: 4,
                    publisherId: 'publisher-id',
                    sequenceNo: 0,
                    signature: null,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    streamId: 'stream-1',
                    streamPartition: 0,
                    timestamp: 5
                },
            ])
            done()
        })
    })

    // TODO: write tests to verify that
    //  (1) publisherId and msgChainId actually filters out undesired message with requestRange and requestFrom
    //  (2) publisherId = null does not filter by publisher
    //  (3) msgChainId = null does not filter by msgChainId
})
