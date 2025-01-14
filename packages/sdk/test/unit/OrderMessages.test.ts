import { randomEthereumAddress, randomUserId } from '@streamr/test-utils'
import {
    EthereumAddress,
    StreamID,
    StreamPartID,
    StreamPartIDUtils,
    collect,
    hexToBinary,
    toStreamID,
    until
} from '@streamr/utils'
import last from 'lodash/last'
import range from 'lodash/range'
import without from 'lodash/without'
import { ResendOptions, ResendRangeOptions, Resends } from '../../src/subscribe/Resends'
import { OrderMessages } from '../../src/subscribe/ordering/OrderMessages'
import { fromArray } from '../../src/utils/GeneratorUtils'
import { PushPipeline } from '../../src/utils/PushPipeline'
import { MOCK_CONTENT } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from './../../src/protocol/StreamMessage'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')
const PUBLISHER_ID = randomUserId()
const MSG_CHAIN_ID = 'mock-msg-chain-id'

const CONFIG = {
    orderMessages: true,
    gapFill: true,
    gapFillStrategy: 'light',
    maxGapRequests: 5,
    retryResendAfter: 50,
    gapFillTimeout: 50
}

const createOrderMessages = (
    resends: Pick<Resends, 'resend'>,
    configOverrides = {},
    getStorageNodes = async () => [randomEthereumAddress()],
    onUnfillableGap = () => {}
) => {
    return new OrderMessages(
        STREAM_PART_ID,
        getStorageNodes,
        onUnfillableGap,
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
        content: MOCK_CONTENT,
        signature: hexToBinary('0x1234'),
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1
    })
}

const createMessages = async (messageCount: number): Promise<StreamMessage[]> => {
    const messages: StreamMessage[] = []
    for (const i of range(messageCount)) {
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

const createResend = (availableMessages: StreamMessage[], isError: (from: number) => boolean = () => false) => {
    return jest
        .fn()
        .mockImplementation(
            async (_streamPartId: StreamPartID, options: ResendRangeOptions): Promise<PushPipeline<StreamMessage>> => {
                const from = new MessageRef(options.from.timestamp as number, options.from.sequenceNumber!)
                const to = new MessageRef(options.to.timestamp as number, options.to.sequenceNumber!)
                if (!isError(from.timestamp)) {
                    return createMessageStream(
                        ...availableMessages.filter(
                            (msg) => msg.getMessageRef().compareTo(from) >= 0 && msg.getMessageRef().compareTo(to) <= 0
                        )
                    )
                } else {
                    throw new Error('mock-error')
                }
            }
        )
}

describe('OrderMessages', () => {
    it('no messages', async () => {
        const orderMessages = createOrderMessages(undefined as any)
        await orderMessages.addMessages(fromArray([]))
        expect(await collect(orderMessages)).toEqual([])
    })

    it('no gaps', async () => {
        const msgs = await createMessages(5)
        const orderMessages = createOrderMessages(undefined as any)
        await orderMessages.addMessages(fromArray(msgs))
        expect(await collect(orderMessages)).toEqual(msgs)
    })

    it('gap of single message', async () => {
        const msgs = await createMessages(5)
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            resend: jest.fn().mockResolvedValue(createMessageStream(...missing))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(msgs)
        expect(resends.resend).toHaveBeenCalledWith(
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
        const msgs = await createMessages(5)
        const missing = msgs.filter((m) => m.getTimestamp() === 3000 || m.getTimestamp() === 4000)
        const resends = {
            resend: jest.fn().mockResolvedValue(createMessageStream(...missing))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(msgs)
        expect(resends.resend).toHaveBeenCalledWith(
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
        const msgs = await createMessages(5)
        const missing1 = msgs.filter((m) => m.getTimestamp() === 2000)
        const missing2 = msgs.filter((m) => m.getTimestamp() === 4000)
        const resends = {
            resend: jest
                .fn()
                .mockResolvedValueOnce(createMessageStream(...missing1))
                .mockResolvedValueOnce(createMessageStream(...missing2))
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing1.concat(missing2))))
        expect(await collect(orderMessages)).toEqual(msgs)
        expect(resends.resend).toHaveBeenNthCalledWith(
            1,
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
        expect(resends.resend).toHaveBeenNthCalledWith(
            2,
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
        const msgs = await createMessages(5)
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            resend: jest.fn().mockImplementation(() => createMessageStream())
        }
        const orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(without(msgs, ...missing))
        expect(resends.resend).toHaveBeenCalledTimes(CONFIG.maxGapRequests)
    })

    it('ignore missing message if gap filling disable', async () => {
        const msgs = await createMessages(5)
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        const resends = {
            resend: jest.fn()
        }
        const orderMessages = createOrderMessages(resends, {
            gapFill: false
        } as any)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(without(msgs, ...missing))
        expect(resends.resend).toHaveBeenCalledTimes(0)
    })

    it('aborts resends when destroyed', async () => {
        const msgs = await createMessages(5)
        const missing = msgs.filter((m) => m.getTimestamp() === 3000)
        let orderMessages: OrderMessages | undefined = undefined
        let resendAborted = false
        const resends = {
            resend: jest
                .fn()
                .mockImplementation(
                    (
                        _streamPartId: StreamPartID,
                        _options: ResendOptions & { raw?: boolean },
                        _getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>,
                        abortSignal?: AbortSignal
                    ) => {
                        abortSignal!.addEventListener('abort', () => (resendAborted = true))
                        orderMessages!.destroy()
                        return createMessageStream(...missing)
                    }
                )
        }
        orderMessages = createOrderMessages(resends)
        await orderMessages.addMessages(fromArray(without(msgs, ...missing)))
        expect(await collect(orderMessages)).toEqual(
            msgs.filter((msg) => msg.getTimestamp() < missing[0].getTimestamp())
        )
        expect(resendAborted).toBe(true)
    })

    describe('strategy', () => {
        const CHUNK1 = [1000, 3000, 8000, 10000]
        const CHUNK2 = [11000, 12000, 14000]

        let allMessages: StreamMessage[]
        let outputMessages: StreamMessage[]

        beforeEach(async () => {
            allMessages = await createMessages(14)
            outputMessages = []
        })

        const startConsuming = (orderMessages: OrderMessages) => {
            setImmediate(async () => {
                for await (const item of orderMessages) {
                    outputMessages.push(item)
                }
            })
        }

        const addMessages = async (orderMessages: OrderMessages) => {
            await orderMessages.addMessages(
                (async function* () {
                    yield* allMessages.filter((m) => CHUNK1.includes(m.getTimestamp()))
                    await until(() => {
                        return outputMessages.some((m) => m.getTimestamp() === last(CHUNK1))
                    })
                    yield* allMessages.filter((m) => CHUNK2.includes(m.getTimestamp()))
                })()
            )
        }

        describe('full', () => {
            it('happy path', async () => {
                const UNAVAILABLE = [5000, 6000]
                const onUnfillableGap = jest.fn()
                const availableMessages = allMessages.filter((m) => !UNAVAILABLE.includes(m.getTimestamp()))
                const resends = {
                    resend: createResend(availableMessages)
                }
                const orderMessages = createOrderMessages(
                    resends,
                    {
                        gapFillStrategy: 'full'
                    },
                    undefined,
                    onUnfillableGap
                )
                startConsuming(orderMessages)
                await addMessages(orderMessages)
                expect(outputMessages).toEqual(availableMessages)
                expect(resends.resend).toHaveBeenCalledTimes(3 + CONFIG.maxGapRequests)
                expect(onUnfillableGap).toHaveBeenCalledTimes(1)
                expect(onUnfillableGap.mock.calls[0][0].from.messageId.timestamp).toBe(4000)
                expect(onUnfillableGap.mock.calls[0][0].to.messageId.timestamp).toBe(7000)
            })

            it('error', async () => {
                const ERROR = [4000, 5000, 6000, 7000]
                const onUnfillableGap = jest.fn()
                const availableMessages = allMessages.filter((m) => !ERROR.includes(m.getTimestamp()))
                const resends = {
                    resend: createResend(availableMessages, (from) => ERROR.includes(from))
                }
                const orderMessages = createOrderMessages(
                    resends,
                    {
                        gapFillStrategy: 'full'
                    },
                    undefined,
                    onUnfillableGap
                )
                startConsuming(orderMessages)
                await addMessages(orderMessages)
                expect(outputMessages).toEqual(availableMessages)
                expect(resends.resend).toHaveBeenCalledTimes(3 + CONFIG.maxGapRequests)
                expect(onUnfillableGap).toHaveBeenCalledTimes(1)
                expect(onUnfillableGap.mock.calls[0][0].from.messageId.timestamp).toBe(3000)
                expect(onUnfillableGap.mock.calls[0][0].to.messageId.timestamp).toBe(8000)
            })
        })

        describe('light', () => {
            it('happy path', async () => {
                const UNAVAILABLE = [5000, 6000]
                const onUnfillableGap = jest.fn()
                const availableMessages = allMessages.filter((m) => !UNAVAILABLE.includes(m.getTimestamp()))
                const resends = {
                    resend: createResend(availableMessages)
                }
                const orderMessages = createOrderMessages(
                    resends,
                    {
                        gapFillStrategy: 'light'
                    },
                    undefined,
                    onUnfillableGap
                )
                startConsuming(orderMessages)
                await addMessages(orderMessages)
                const expectedMessages = allMessages.filter(
                    // ignore the gap 8000-10000 as it has accumulated while we process the unfillable
                    // gap of 3000-8000
                    (m) => !UNAVAILABLE.includes(m.getTimestamp()) && m.getTimestamp() !== 9000
                )
                expect(outputMessages).toEqual(expectedMessages)
                expect(resends.resend).toHaveBeenCalledTimes(2 + CONFIG.maxGapRequests)
                expect(onUnfillableGap).toHaveBeenCalledTimes(2)
                expect(onUnfillableGap.mock.calls[0][0].from.messageId.timestamp).toBe(4000)
                expect(onUnfillableGap.mock.calls[0][0].to.messageId.timestamp).toBe(7000)
                expect(onUnfillableGap.mock.calls[1][0].from.messageId.timestamp).toBe(8000)
                expect(onUnfillableGap.mock.calls[1][0].to.messageId.timestamp).toBe(10000)
            })

            it('error', async () => {
                const ERROR = [4000, 5000, 6000, 7000]
                const onUnfillableGap = jest.fn()
                const availableMessages = allMessages.filter((m) => !ERROR.includes(m.getTimestamp()))
                const resends = {
                    resend: createResend(availableMessages)
                }
                const orderMessages = createOrderMessages(
                    resends,
                    {
                        gapFillStrategy: 'light'
                    },
                    undefined,
                    onUnfillableGap
                )
                startConsuming(orderMessages)
                await addMessages(orderMessages)
                const expectedMessages = allMessages.filter(
                    // ignore the gap 8000-10000 as it has accumulated while we process the unfillable
                    // gap of 3000-8000
                    (m) => !ERROR.includes(m.getTimestamp()) && m.getTimestamp() !== 9000
                )
                expect(outputMessages).toEqual(expectedMessages)
                expect(resends.resend).toHaveBeenCalledTimes(2 + CONFIG.maxGapRequests)
                expect(onUnfillableGap).toHaveBeenCalledTimes(2)
                expect(onUnfillableGap.mock.calls[0][0].from.messageId.timestamp).toBe(3000)
                expect(onUnfillableGap.mock.calls[0][0].to.messageId.timestamp).toBe(8000)
                expect(onUnfillableGap.mock.calls[1][0].from.messageId.timestamp).toBe(8000)
                expect(onUnfillableGap.mock.calls[1][0].to.messageId.timestamp).toBe(10000)
            })
        })
    })

    describe('storage node caching', () => {
        it('no gaps', async () => {
            const getStorageNodes = jest.fn()
            const orderMessages = createOrderMessages(undefined as any, undefined, getStorageNodes)
            await orderMessages.addMessages(fromArray(await createMessages(5)))
            await collect(orderMessages)
            expect(getStorageNodes).not.toHaveBeenCalled()
        })

        it('multiple gaps', async () => {
            const getStorageNodes = jest.fn().mockResolvedValue([randomEthereumAddress()])
            const resends = {
                resend: jest.fn().mockImplementation(() => createMessageStream())
            }
            const orderMessages = createOrderMessages(resends, undefined, getStorageNodes)
            const messages = (await createMessages(5)).filter(
                (m) => m.getTimestamp() !== 2000 && m.getTimestamp() !== 4000
            )
            await orderMessages.addMessages(fromArray(messages))
            await collect(orderMessages)
            expect(getStorageNodes).toHaveBeenCalledTimes(1)
        })
    })
})
