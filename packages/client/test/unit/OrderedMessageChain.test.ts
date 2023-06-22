import { MessageID, MessageRef, StreamMessage, toStreamID } from '@streamr/protocol'
import { toEthereumAddress } from '@streamr/utils'
import { Gap, OrderedMessageChain } from '../../src/subscribe/ordering/OrderedMessageChain'

const STREAM_ID = toStreamID('stream')
const PUBLISHER_ID = toEthereumAddress('0x0000000000000000000000000000000000000001')
const MSG_CHAIN_ID = 'msgChainId'

const createMessage = (timestamp: number, hasPrevRef = true) => {
    return new StreamMessage({
        messageId: new MessageID(STREAM_ID, 0, timestamp, 0, PUBLISHER_ID, MSG_CHAIN_ID),
        prevMsgRef: hasPrevRef ? new MessageRef(timestamp - 1, 0) : null,
        content: '{}',
        signature: 'signature'
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

    const getOrderedTimestamps = () => {
        return onOrderedMessageAdded.mock.calls.map((call) => call[0].getTimestamp())
    }

    const expectGaps = (gaps: Gap[], allResolved = true) => {
        expect(onGapFound).toBeCalledTimes(gaps.length)
        for (let i = 0; i < gaps.length; i++) {
            expect(onGapFound).toHaveBeenNthCalledWith(i + 1, gaps[i])
        }
        if (allResolved) {
            expect(onGapResolved).toBeCalledTimes(gaps.length)
        }
    }

    beforeEach(() => {
        onOrderedMessageAdded = jest.fn()
        onGapFound = jest.fn()
        onGapResolved = jest.fn()
        chain = new OrderedMessageChain(undefined as any, new AbortController().signal)
        chain.on('orderedMessageAdded', onOrderedMessageAdded)
        chain.on('gapFound', onGapFound)
        chain.on('gapResolved', onGapResolved)
    })

    it('no gaps', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(3))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3])
        expectGaps([])
    })

    it('find gap', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(3))
        expect(getOrderedTimestamps()).toEqual([1])
        expectGaps([
            createGap(1, 3)
        ], false)
        expect(onGapResolved).not.toBeCalled()
    })

    it('debug', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(4))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5])
        expectGaps([
            createGap(1, 3),
            createGap(3, 5)
        ])
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
        expectGaps([
            createGap(3, 9)
        ])
    })

    it('fill multiple gaps', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(6))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4, 5, 6])
        expectGaps([
            createGap(1, 3),
            createGap(3, 5)
        ])
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
        expectGaps([
            createGap(1, 3)
        ])
    })

    it('stale message', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(4))
        expect(getOrderedTimestamps()).toEqual([1, 2, 3, 4])
        expectGaps([])
    })

    it('process pending messages when manually resolving gap', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(3))
        chain.addMessage(createMessage(6))
        chain.resolveMessages(new MessageRef(5, 0))
        expect(getOrderedTimestamps()).toEqual([1, 3, 5, 6])
        expectGaps([
            createGap(1, 5)
        ])
    })

    it('find pending gap when manually resolving gap', () => {
        chain.addMessage(createMessage(1))
        chain.addMessage(createMessage(2))
        chain.addMessage(createMessage(4))
        chain.addMessage(createMessage(5))
        chain.addMessage(createMessage(7))
        chain.resolveMessages(new MessageRef(4, 0))
        expect(getOrderedTimestamps()).toEqual([1, 2, 4, 5])
        expectGaps([
            createGap(2, 4),
            createGap(5, 7)
        ], false)
        expect(onGapResolved).toBeCalledTimes(1)
    })

    it('without references', () => {
        chain.addMessage(createMessage(1, false))
        chain.addMessage(createMessage(3, false))
        expect(getOrderedTimestamps()).toEqual([1, 3])
        expectGaps([])
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

})
