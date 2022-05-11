import { BUCKET_LENGTH, BucketStatistics, getBucketNumber } from '../../src/logic/receipts/BucketStatistics'
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

describe(BucketStatistics, () => {
    let bucketStatistics: BucketStatistics

    beforeEach(() => {
        bucketStatistics = new BucketStatistics()
    })

    it('initially node has no buckets', () => {
        expect(bucketStatistics.getBucketsFor('nodeId')).toEqual([])
    })

    it('recording some data and getting the bucket', () => {
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME, 40))
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 15000, 160))
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 32000, 100))
        expect(bucketStatistics.getBucketsFor('nodeId')).toEqual([
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
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME, 40))
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + (BUCKET_LENGTH / 2), 60))

        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + BUCKET_LENGTH, 100))
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + BUCKET_LENGTH + 1000, 20))

        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 2 * BUCKET_LENGTH + 2000, 15))
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 2 * BUCKET_LENGTH + BUCKET_LENGTH*(3/4), 20))

        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME + 6 * BUCKET_LENGTH, 150))

        const firstBucketNumber = getBucketNumber(START_TIME)
        expect(bucketStatistics.getBucketsFor('nodeId')).toEqual([
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
        bucketStatistics.record('nodeA', msg1)
        bucketStatistics.record('nodeA', msg2)
        bucketStatistics.record('nodeB', msg1)
        expect(bucketStatistics.getBucketsFor('nodeA')).toEqual([
            {
                streamPartId: SP1,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                bucketNumber: getBucketNumber(START_TIME),
                messageCount: 2,
                totalPayloadSize: 80 + 120
            }
        ])
        expect(bucketStatistics.getBucketsFor('nodeB')).toEqual([
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
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherId', 'msgChainId', START_TIME, 40))
        bucketStatistics.record('nodeId', makeMsg(SP1_1, 'publisherId', 'msgChainId', START_TIME + 1, 40))
        bucketStatistics.record('nodeId', makeMsg(SP2, 'publisherId', 'msgChainId', START_TIME + 2, 40))
        expect(bucketStatistics.getBucketsFor('nodeId')).toHaveLength(3)
    })

    it('buckets for a fixed streamPart are publisherId-specific', () => {
        const msgChainId = 'msgChainId'
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherOne', msgChainId, START_TIME, 40))
        bucketStatistics.record('nodeId', makeMsg(SP1, 'publisherTwo', msgChainId, START_TIME + 1, 40))
        bucketStatistics.record('nodeId', makeMsg(SP2, 'publisherThree', msgChainId, START_TIME + 2, 40))
        expect(bucketStatistics.getBucketsFor('nodeId')).toHaveLength(3)
    })

    it('buckets for a fixed (streamPart, publisherId)-pair are msgChain-specific', () => {
        const publisherId = 'publisherId'
        bucketStatistics.record('nodeId', makeMsg(SP1, publisherId, 'msgChainOne', START_TIME, 40))
        bucketStatistics.record('nodeId', makeMsg(SP1, publisherId, 'msgChainTwo', START_TIME + 1, 40))
        bucketStatistics.record('nodeId', makeMsg(SP2, publisherId, 'msgChainThree', START_TIME + 2, 40))
        expect(bucketStatistics.getBucketsFor('nodeId')).toHaveLength(3)
    })
})
