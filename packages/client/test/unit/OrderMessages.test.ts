import { MessageID, StreamMessage, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import range from 'lodash/range'
import without from 'lodash/without'
import { MessageStream } from './../../src/subscribe/MessageStream'
import { OrderMessages } from './../../src/subscribe/OrderMessages'
import { Resends } from './../../src/subscribe/Resends'
import { fromArray } from './../../src/utils/GeneratorUtils'
import { mockLoggerFactory } from './../test-utils/utils'

const MESSAGE_COUNT = 5
const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')
const PUBLISHER_ID = randomEthereumAddress()
const MSG_CHAIN_ID = 'mock-msg-chain-id'

const CONFIG = {
    orderMessages: true,
    gapFill: true,
    maxGapRequests: 5,
    retryResendAfter: 50,
    gapFillTimeout: 50
}

const createTransform = (resends: Pick<Resends, 'range'>, config = CONFIG) => {
    return new OrderMessages(
        config as any,
        resends as any,
        STREAM_PART_ID,
        mockLoggerFactory(),
        undefined as any
    ).transform()
}

const createMockMessages = async (): Promise<StreamMessage[]> => {
    const messages: StreamMessage[] = []
    for (const i of range(MESSAGE_COUNT)) {
        const msg = new StreamMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, (i + 1) * 1000, 0, PUBLISHER_ID, MSG_CHAIN_ID),
            prevMsgRef: (i > 0) ? messages[i - 1].getMessageRef() : null,
            content: {},
            signature: 'signature'
        })
        messages.push(msg)
    }
    return messages
}

const createMessageStream = (...msgs: StreamMessage[]) => {
    const result = new MessageStream()
    for (const msg of msgs) {
        result.push(msg)
    }
    result.endWrite()
    return result
}

describe('OrderMessages', () => {

    it('no gaps', async () => {
        const msgs = await createMockMessages()
        const transform = createTransform(undefined as any)
        const output = transform(fromArray(msgs))
        expect(await collect(output)).toEqual(msgs)
    })

    it('gap of single message', async () => {
        const msgs = await createMockMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            range: jest.fn().mockResolvedValue(createMessageStream(...missing))
        }
        const transform = createTransform(resends)
        const output = transform(fromArray(without(msgs, ...missing)))
        expect(await collect(output)).toEqual(msgs)
        expect(resends.range).toBeCalledWith(
            STREAM_PART_ID,
            {
                fromTimestamp: 2000,
                fromSequenceNumber: 1,
                toTimestamp: 3000,
                toSequenceNumber: 0,
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID
            },
            true,
            undefined
        )
    })

    it('gap of multiple messages', async () => {
        const msgs = await createMockMessages()
        const missing = msgs.filter((m) => (m.getTimestamp() === 3000) || (m.getTimestamp() === 4000))
        const resends = {
            range: jest.fn().mockResolvedValue(createMessageStream(...missing))
        }
        const transform = createTransform(resends)
        const output = transform(fromArray(without(msgs, ...missing)))
        expect(await collect(output)).toEqual(msgs)
        expect(resends.range).toBeCalledWith(
            STREAM_PART_ID,
            {
                fromTimestamp: 2000,
                fromSequenceNumber: 1,
                toTimestamp: 4000,
                toSequenceNumber: 0,
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID
            },
            true,
            undefined
        )
    })

    it('multiple gaps', async () => {
        const msgs = await createMockMessages()
        const missing1 = msgs.filter((m) => m.getTimestamp() === 2000)
        const missing2 = msgs.filter((m) => m.getTimestamp() === 4000)
        const resends = {
            range: jest.fn()
                .mockResolvedValueOnce(createMessageStream(...missing1))
                .mockResolvedValueOnce(createMessageStream(...missing2))
        }
        const transform = createTransform(resends)
        const output = transform(fromArray(without(msgs, ...missing1.concat(missing2))))
        expect(await collect(output)).toEqual(msgs)
        expect(resends.range).toHaveBeenNthCalledWith(1,
            STREAM_PART_ID,
            {
                fromTimestamp: 1000,
                fromSequenceNumber: 1,
                toTimestamp: 2000,
                toSequenceNumber: 0,
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID
            },
            true,
            undefined
        )
        expect(resends.range).toHaveBeenNthCalledWith(2,
            STREAM_PART_ID,
            {
                fromTimestamp: 3000,
                fromSequenceNumber: 1,
                toTimestamp: 4000,
                toSequenceNumber: 0,
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID
            },
            true,
            undefined
        )
    })

    it('ignore missing message if no data in storage node', async () => {
        const msgs = await createMockMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            range: jest.fn().mockImplementation(() => createMessageStream())
        }
        const transform = createTransform(resends)
        const output = transform(fromArray(without(msgs, ...missing)))
        expect(await collect(output)).toEqual(without(msgs, ...missing))
        expect(resends.range).toBeCalledTimes(CONFIG.maxGapRequests)
    })

    it('ignore missing message if gap filling disable', async () => {
        const msgs = await createMockMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            range: jest.fn()
        }
        const transform = createTransform(resends, {
            orderMessages: false
        } as any)
        const output = transform(fromArray(without(msgs, ...missing)))
        expect(await collect(output)).toEqual(without(msgs, ...missing))
        expect(resends.range).toBeCalledTimes(0)
    })
})
