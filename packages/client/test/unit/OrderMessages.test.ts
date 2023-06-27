import { MessageID, MessageRef, StreamID, StreamMessage, StreamPartID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress, collect } from '@streamr/utils'
import range from 'lodash/range'
import without from 'lodash/without'
import { ResendOptions, Resends } from '../../src/subscribe/Resends'
import { OrderMessages } from '../../src/subscribe/ordering/OrderMessages'
import { fromArray } from '../../src/utils/GeneratorUtils'
import { PushPipeline } from '../../src/utils/PushPipeline'

const MESSAGE_COUNT = 7
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

const createOrderMessages = (
    resends: Pick<Resends, 'resend'>, 
    getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]> = async () => [randomEthereumAddress()],
    configOverrides = {}
) => {
    return new OrderMessages(
        STREAM_PART_ID,
        getStorageNodes,
        () => {},
        resends as any,
        {
            ...CONFIG,
            ...configOverrides
        } as any
    )
}

const createMessage = (timestamp: number) => {
    return new StreamMessage({
        messageId: new MessageID(toStreamID('streamId'), 0, timestamp, 0, PUBLISHER_ID, MSG_CHAIN_ID),
        prevMsgRef: new MessageRef(timestamp - 1000, 0),
        content: {},
        signature: 'signature'
    })
}

const createMessages = async (): Promise<StreamMessage[]> => {
    const messages: StreamMessage[] = []
    for (const i of range(MESSAGE_COUNT)) {
        messages.push(createMessage((i + 1) * 1000))
    }
    return messages
}

const createMessageStream = (...msgs: StreamMessage[]): PushPipeline<StreamMessage, StreamMessage> => {
    const result = new PushPipeline<StreamMessage, StreamMessage>()
    for (const msg of msgs) {
        result.push(msg)
    }
    result.endWrite()
    return result
}

describe('OrderMessages', () => {

    it('no messages', async () => {
        const orderMessages = createOrderMessages(undefined as any)
        await orderMessages.addMessages(fromArray([]))
        expect(await collect(orderMessages)).toEqual([])
    })

    it('no gaps', async () => {
        const msgs = await createMessages()
        const orderMessages = createOrderMessages(undefined as any)
        await orderMessages.addMessages(fromArray(msgs))
        expect(await collect(orderMessages)).toEqual(msgs)
    })

    it('gap of single message', async () => {
        const msgs = await createMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            resend: jest.fn().mockResolvedValue(createMessageStream(...missing))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(msgs)
        expect(resends.resend).toBeCalledWith(
            STREAM_PART_ID,
            {
                from: new MessageRef(2000, 1),
                to: new MessageRef(3000, 0),
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID,
                raw: true
            },
            expect.toBeFunction(),
            expect.anything()
        )
    })

    it('gap of multiple messages', async () => {
        const msgs = await createMessages()
        const missing = msgs.filter((m) => (m.getTimestamp() === 3000) || (m.getTimestamp() === 4000))
        const resends = {
            resend: jest.fn().mockResolvedValue(createMessageStream(...missing))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(msgs)
        expect(resends.resend).toBeCalledWith(
            STREAM_PART_ID,
            {
                from: new MessageRef(2000, 1),
                to: new MessageRef(4000, 0),
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID,
                raw: true
            },
            expect.toBeFunction(),
            expect.anything()
        )
    })

    it('multiple gaps', async () => {
        const msgs = await createMessages()
        const missing1 = msgs.filter((m) => m.getTimestamp() === 2000)
        const missing2 = msgs.filter((m) => m.getTimestamp() === 4000)
        const resends = {
            resend: jest.fn()
                .mockResolvedValueOnce(createMessageStream(...missing1))
                .mockResolvedValueOnce(createMessageStream(...missing2))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing1.concat(missing2))))
        expect(await collect(orderMessages)).toEqual(msgs)
        expect(resends.resend).toHaveBeenNthCalledWith(1,
            STREAM_PART_ID,
            {
                from: new MessageRef(1000, 1),
                to: new MessageRef(2000, 0),
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID,
                raw: true
            },
            expect.toBeFunction(),
            expect.anything()
        )
        expect(resends.resend).toHaveBeenNthCalledWith(2,
            STREAM_PART_ID,
            {
                from: new MessageRef(3000, 1),
                to: new MessageRef(4000, 0),
                publisherId: PUBLISHER_ID,
                msgChainId: MSG_CHAIN_ID,
                raw: true
            },
            expect.toBeFunction(),
            expect.anything()
        )
    })

    it('ignore missing message if no data in storage node', async () => {
        const msgs = await createMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            resend: jest.fn().mockImplementation(() => createMessageStream())
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(without(msgs, ...missing))
        expect(resends.resend).toBeCalledTimes(CONFIG.maxGapRequests)
    })

    it('ignore missing message if gap filling disable', async () => {
        const msgs = await createMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            resend: jest.fn()
        }
        const orderMessages = createOrderMessages(resends, undefined, {
            gapFill: false
        } as any)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(without(msgs, ...missing))
        expect(resends.resend).toBeCalledTimes(0)
    })

    it('gap fill error', async () => {
        const msgs = await createMessages()
        const missing1 = msgs.filter((m) => m.getTimestamp() === 2000)
        const missing2 = msgs.filter((m) => m.getTimestamp() === 4000)
        const missing3 = msgs.filter((m) => m.getTimestamp() === 6000)
        const resends = {
            resend: jest.fn()
                .mockResolvedValueOnce(createMessageStream(...missing1))
                // 5 error responses (CONFIG.maxGapRequests)
                .mockRejectedValueOnce(new Error('mock-error'))
                .mockRejectedValueOnce(new Error('mock-error'))
                .mockRejectedValueOnce(new Error('mock-error'))
                .mockRejectedValueOnce(new Error('mock-error'))
                .mockRejectedValueOnce(new Error('mock-error'))
                .mockResolvedValueOnce(createMessageStream(...missing3))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing1.concat(missing2).concat(missing3))))
        expect(await collect(orderMessages)).toEqual(without(msgs, ...missing2))
        expect(resends.resend).toBeCalledTimes(2 + CONFIG.maxGapRequests)
    })

    it('aborts resends when destroyed', async () => {
        const msgs = await createMessages()
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        let orderMessages: OrderMessages | undefined = undefined
        let resendAborted = false
        const resends = {
            resend: jest.fn().mockImplementation((
                _streamPartId: StreamPartID,
                _options: ResendOptions & { raw?: boolean },
                _getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>,
                abortSignal?: AbortSignal
            ) => {
                abortSignal!.addEventListener('abort', () => resendAborted = true)
                orderMessages!.destroy()
                return createMessageStream(...missing)
            })
        }
        orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(msgs.filter((msg) => msg.getTimestamp() < missing[0].getTimestamp()))
        expect(resendAborted).toBe(true)
    })

    describe('storage node caching', () => {

        it('no gaps', async () => {
            const getStorageNodes = jest.fn()
            const orderMessages = createOrderMessages(undefined as any, getStorageNodes)
            await orderMessages.addMessages(fromArray(await createMessages()))
            await collect(orderMessages)
            expect(getStorageNodes).not.toBeCalled()
        })

        it('multiple gaps', async () => {
            const getStorageNodes = jest.fn().mockResolvedValue([randomEthereumAddress()])
            const resends = {
                resend: jest.fn().mockImplementation(() => createMessageStream())
            }
            const orderMessages = createOrderMessages(resends, getStorageNodes)
            const messages = (await createMessages()).filter(
                (m) => (m.getTimestamp() !== 2000) && (m.getTimestamp() !== 4000)
            )
            await orderMessages.addMessages(fromArray(messages))
            await collect(orderMessages)
            expect(getStorageNodes).toBeCalledTimes(1)
        })
    })
})
