import { BUCKET_LENGTH, BucketStatsCollector, getBucketNumber } from '../../src/logic/receipts/BucketStatsCollector'
import {
    MessageID,
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils,
} from 'streamr-client-protocol'

function makeMsg(
    streamPartId: StreamPartID,
    publisherId: string,
    msgChainId: string,
    timestamp: number,
    payloadSize: number
): StreamMessage {
    return new StreamMessage({
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(streamPartId),
            StreamPartIDUtils.getStreamPartition(streamPartId),
            timestamp,
            0,
            publisherId,
            msgChainId
        ),
        prevMsgRef: null,
        content: {
            'key': 'a'.repeat(payloadSize - 10)
        }
    })
}

const START_TIME = 1652252050000
const SP1 = StreamPartIDUtils.parse('sp1#0')
const SP1_1 = StreamPartIDUtils.parse('sp1#1')
const SP2 = StreamPartIDUtils.parse('sp2#0')

describe(getBucketNumber, () => {
    const BASE_BUCKET_NUMBER = getBucketNumber(START_TIME)
    const LOWER_BOUND = BASE_BUCKET_NUMBER * BUCKET_LENGTH
    const UPPER_BOUND = (BASE_BUCKET_NUMBER + 1) * BUCKET_LENGTH - 1

    it('works as expected', () => {
        expect(START_TIME).toBeWithin(LOWER_BOUND, UPPER_BOUND)
        expect(getBucketNumber(LOWER_BOUND)).toEqual(BASE_BUCKET_NUMBER)
        expect(getBucketNumber(LOWER_BOUND + Math.floor(BUCKET_LENGTH * (1/4)))).toEqual(BASE_BUCKET_NUMBER)
        expect(getBucketNumber(LOWER_BOUND + Math.floor(BUCKET_LENGTH * (2/4)))).toEqual(BASE_BUCKET_NUMBER)
        expect(getBucketNumber(LOWER_BOUND + Math.floor(BUCKET_LENGTH * (3/4)))).toEqual(BASE_BUCKET_NUMBER)
        expect(getBucketNumber(UPPER_BOUND)).toEqual(BASE_BUCKET_NUMBER)

        // previous and next buckets
        expect(getBucketNumber(LOWER_BOUND - 1)).toEqual(BASE_BUCKET_NUMBER - 1)
        expect(getBucketNumber(UPPER_BOUND + 1)).toEqual(BASE_BUCKET_NUMBER + 1)
    })
})

describe(BucketStatsCollector, () => {
    let collector: BucketStatsCollector

    beforeEach(() => {
        collector = new BucketStatsCollector()
    })

    it('initially node has no buckets', () => {
        expect(collector.getBucketsFor('nodeId')).toEqual([])
    })

    it('recording some data and getting the bucket', () => {
        collector.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME, 40))
        collector.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 15000, 160))
        collector.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 32000, 100))
        expect(collector.getBucketsFor('nodeId')).toEqual([
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: getBucketNumber(START_TIME),
                messageCount: 3,
                totalPayloadSize: 40 + 160 + 100
            }
        ])
    })

    it('recording some data spanning multiple buckets and getting the buckets', () => {
        const makeFixedMsg = (timestamp: number, payloadSize: number) => {
            return makeMsg(SP1, 'publisherId', 'msgChainId', timestamp, payloadSize)
        }
        collector.record('nodeId', makeFixedMsg(START_TIME, 40))
        collector.record('nodeId', makeFixedMsg(START_TIME + (BUCKET_LENGTH / 2), 60))

        collector.record('nodeId', makeFixedMsg(START_TIME + BUCKET_LENGTH, 100))
        collector.record('nodeId', makeFixedMsg(START_TIME + BUCKET_LENGTH + 1000, 20))

        collector.record('nodeId', makeFixedMsg(START_TIME + 2 * BUCKET_LENGTH + 2000, 15))
        collector.record('nodeId', makeFixedMsg(START_TIME + 2 * BUCKET_LENGTH + BUCKET_LENGTH*(3/4), 20))

        collector.record('nodeId', makeFixedMsg(START_TIME + 6 * BUCKET_LENGTH, 150))

        const firstBucketNumber = getBucketNumber(START_TIME)
        expect(collector.getBucketsFor('nodeId')).toEqual([
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: firstBucketNumber,
                messageCount: 2,
                totalPayloadSize: 40 + 60
            },
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: firstBucketNumber + 1,
                messageCount: 2,
                totalPayloadSize: 100 + 20
            },
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: firstBucketNumber + 2,
                messageCount: 2,
                totalPayloadSize: 15 + 20
            },
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: firstBucketNumber + 6,
                messageCount: 1,
                totalPayloadSize: 150
            }
        ])
    })

    it('buckets are neighbor-specific', () => {
        const msg1 = makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME, 80)
        const msg2 = makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 10, 120)
        collector.record('nodeA', msg1)
        collector.record('nodeA', msg2)
        collector.record('nodeB', msg1)
        expect(collector.getBucketsFor('nodeA')).toEqual([
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: getBucketNumber(START_TIME),
                messageCount: 2,
                totalPayloadSize: 80 + 120
            }
        ])
        expect(collector.getBucketsFor('nodeB')).toEqual([
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: getBucketNumber(START_TIME),
                messageCount: 1,
                totalPayloadSize: 80
            }
        ])
    })

    it('buckets are streamPart-specific', () => {
        collector.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME, 40))
        collector.record('nodeId', makeMsg(SP1_1, 'publisherId', 'msgChainId', START_TIME + 1, 40))
        collector.record('nodeId', makeMsg(SP2, 'publisherId', 'msgChainId', START_TIME + 2, 40))
        expect(collector.getBucketsFor('nodeId')).toHaveLength(3)
    })

    it('buckets for a fixed streamPart are publisherId-specific', () => {
        const msgChainId = 'msgChainId'
        collector.record('nodeId', makeMsg(SP1, 'publisherOne', msgChainId, START_TIME, 40))
        collector.record('nodeId', makeMsg(SP1, 'publisherTwo', msgChainId, START_TIME + 1, 40))
        collector.record('nodeId', makeMsg(SP2, 'publisherThree', msgChainId, START_TIME + 2, 40))
        expect(collector.getBucketsFor('nodeId')).toHaveLength(3)
    })

    it('buckets for a fixed (streamPart, publisherId)-pair are msgChain-specific', () => {
        const publisherId = 'publisherId'
        collector.record('nodeId', makeMsg(SP1, publisherId, 'msgChainOne', START_TIME, 40))
        collector.record('nodeId', makeMsg(SP1, publisherId, 'msgChainTwo', START_TIME + 1, 40))
        collector.record('nodeId', makeMsg(SP2, publisherId, 'msgChainThree', START_TIME + 2, 40))
        expect(collector.getBucketsFor('nodeId')).toHaveLength(3)
    })
})
