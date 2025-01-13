import { hexToBinary, toStreamID, utf8ToBinary } from '@streamr/utils'
import { Gap, OrderedMessageChain } from '../../src/subscribe/ordering/OrderedMessageChain'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from './../../src/protocol/StreamMessage'
import { randomUserId } from '@streamr/test-utils'

const STREAM_ID = toStreamID('stream')
const PUBLISHER_ID = randomUserId()
const MSG_CHAIN_ID = 'msgChainId'

const createMessage = (timestamp: number, hasPrevRef = true) => {
    return new StreamMessage({
        messageId: new MessageID(STREAM_ID, 0, timestamp, 0, PUBLISHER_ID, MSG_CHAIN_ID),
        prevMsgRef: hasPrevRef ? new MessageRef(timestamp - 1, 0) : undefined,
        content: utf8ToBinary('{}'),
        signature: hexToBinary('0x1234'),
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1
    })
}

const createGap = (from: number, to: number): Gap => {
    return {
        from: createMessage(from),
        to: createMessage(to)
    }
}

describe('OrderedMessageChain', () => {
    let chain: OrderedMessageChain
    let onOrderedMessageAdded: jest.Mock<void, [msg: StreamMessage]>
    let onGapFound: jest.Mock<void, [gap: Gap]>
    let onGapResolved: jest.Mock<void, []>
    let onUnfillableGap: jest.Mock<void, [gap: Gap]>

    const getOrderedTimestamps = () => {
        return onOrderedMessageAdded.mock.calls.map((call) => call[0].getTimestamp())
    }

    const expectFoundGaps = (gaps: Gap[], allResolved = true) => {
        expect(onGapFound).toHaveBeenCalledTimes(gaps.length)
        for (let i = 0; i < gaps.length; i++) {
            expect(onGapFound).toHaveBeenNthCalledWith(i + 1, gaps[i])
        }
        if (allResolved) {
            expect(onGapResolved).toHaveBeenCalledTimes(gaps.length)
        }
    }

    const expectUnfillableGaps = (gaps: Gap[]) => {
        expect(onUnfillableGap).toHaveBeenCalledTimes(gaps.length)
        for (let i = 0; i < gaps.length; i++) {
            expect(onUnfillableGap).toHaveBeenNthCalledWith(i + 1, gaps[i])
        }
    }

    beforeEach(() => {
        onOrderedMessageAdded = jest.fn()
        onGapFound = jest.fn()
        onGapResolved = jest.fn()
        onUnfillableGap = jest.fn()
        chain = new OrderedMessageChain(undefined as any, new AbortController().signal)
        chain.on('orderedMessageAdded', onOrderedMessageAdded)
        chain.on('gapFound', onGapFound)
        chain.on('gapResolved', onGapResolved)
        chain.on('unfillableGap', onUnfillableGap)
    })

    it('no gaps', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(3))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3])
        expectFoundGaps([])
    })

    it('find gap', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(3))
        expect(getOrderedTimestamps()).toEqual([1])
        expectFoundGaps([createGap(1, 3)], false)
        expect(onGapResolved).not.toHaveBeenCalled()
    })

    it('fill single gap', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(9))
        chain.addMessage(createMessage(7))
        chain.addMessage(createMessage(6))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(8))
        chain.addMessage(createMessage(10))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        expectFoundGaps([createGap(3, 9)])
    })

    it('fill multiple gaps', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(6))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5, 6])
        expectFoundGaps([createGap(1, 3), createGap(3, 5)])
    })

    it('fill nested gap', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(6))
        chain.addMessage(createMessage(8))
        chain.addMessage(createMessage(7))
        chain.addMessage(createMessage(2))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
        expectFoundGaps([createGap(1, 3)])
    })

    it('duplicates', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(5))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5])
        expectFoundGaps([createGap(2, 4)])
    })

    it('stale message', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(4))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4])
        expectFoundGaps([])
    })

    it('without references', () => {
        chain.addMessage(createMessage(1, false))
        chain.addMessage(createMessage(3, false))
        expect(getOrderedTimestamps()).toEqual([1, 3])
        expectFoundGaps([])
    })

    it('wait until idle', async () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(4))
        const waitUntilIdle = chain.waitUntilIdle()
        setTimeout(() => {
            chain.addMessage(createMessage(5))
            chain.addMessage(createMessage(7))
            chain.addMessage(createMessage(6))
            chain.addMessage(createMessage(3))
        }, 50)
        await waitUntilIdle
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    describe('manual resolve', () => {
        it('process pending messages when resolving gap', () => {
            chain.addMessage(createMessage(1))
            chain.addMessage(createMessage(5))
            chain.addMessage(createMessage(3))
            chain.addMessage(createMessage(6))
            chain.resolveMessages(new MessageRef(5, 0), true)
            expect(getOrderedTimestamps()).toEqual([1, 3, 5, 6])
            expectFoundGaps([createGap(1, 5)])
            expectUnfillableGaps([createGap(1, 3), createGap(3, 5)])
        })

        it('find pending gap when resolving gap', () => {
            chain.addMessage(createMessage(1))
            chain.addMessage(createMessage(2))
            chain.addMessage(createMessage(4))
            chain.addMessage(createMessage(5))
            chain.addMessage(createMessage(7))
            chain.resolveMessages(new MessageRef(4, 0), true)
            expect(getOrderedTimestamps()).toEqual([1, 2, 4, 5])
            expectFoundGaps([createGap(2, 4), createGap(5, 7)], false)
            expectUnfillableGaps([createGap(2, 4)])
            expect(onGapResolved).toHaveBeenCalledTimes(1)
        })

        it('find only the current gap when resolving all messages', () => {
            chain.addMessage(createMessage(1))
            chain.addMessage(createMessage(2))
            chain.addMessage(createMessage(4))
            chain.addMessage(createMessage(5))
            chain.addMessage(createMessage(7))
            chain.addMessage(createMessage(8))
            chain.addMessage(createMessage(10))
            chain.resolveMessages(undefined, true)
            expect(getOrderedTimestamps()).toEqual([1, 2, 4, 5, 7, 8, 10])
            expectFoundGaps([createGap(2, 4)])
            expectUnfillableGaps([createGap(2, 4), createGap(5, 7), createGap(8, 10)])
        })

        it('disabled gap finding when resolving all messages', () => {
            chain.addMessage(createMessage(1))
            chain.addMessage(createMessage(2))
            chain.addMessage(createMessage(4))
            chain.addMessage(createMessage(5))
            chain.addMessage(createMessage(7))
            chain.resolveMessages(undefined, false)
            expect(getOrderedTimestamps()).toEqual([1, 2, 4, 5, 7])
            expectFoundGaps([createGap(2, 4)])
            expectUnfillableGaps([createGap(2, 4), createGap(5, 7)])
        })
    })
})
