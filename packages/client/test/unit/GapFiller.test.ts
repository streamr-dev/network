import { MessageID, MessageRef, StreamMessage, StreamPartIDUtils } from '@streamr/protocol'
import { Defer, EthereumAddress, toEthereumAddress, wait, waitForCondition } from '@streamr/utils'
import { OrderedMessageChain } from '../../src/subscribe/ordering/OrderedMessageChain'
import { GapFiller, GapFillStrategy } from '../../src/subscribe/ordering/GapFiller'
import { Gap } from '../../src/subscribe/ordering/OrderedMessageChain'
import { fromArray } from '../../src/utils/GeneratorUtils'

const CONTEXT = {
    streamPartId: StreamPartIDUtils.parse('stream#0'),
    publisherId: toEthereumAddress('0x0000000000000000000000000000000000000001'),
    msgChainId: 'msgChainId'
}
const STORAGE_NODE_ADDRESS = toEthereumAddress('0x0000000000000000000000000000000000000002')

const createMessage = (timestamp: number, hasPrevRef = true) => {
    return new StreamMessage({
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(CONTEXT.streamPartId),
            StreamPartIDUtils.getStreamPartition(CONTEXT.streamPartId),
            timestamp,
            0,
            CONTEXT.publisherId, 
            CONTEXT.msgChainId
        ),
        prevMsgRef: hasPrevRef ? new MessageRef(timestamp - 1, 0) : null,
        content: '{}',
        signature: 'signature'
    })
}

const MAX_REQUESTS_PER_GAP = 3
const INITIAL_WAIT_TIME = 50

describe('GapFiller', () => {

    let chain: OrderedMessageChain
    const onOrderedMessageAdded = jest.fn()
    let abortController: AbortController

    beforeEach(() => {
        abortController = new AbortController()
        chain = new OrderedMessageChain(CONTEXT, abortController.signal)
        chain.on('orderedMessageAdded', onOrderedMessageAdded)
    })

    const startActiveGapFiller = (
        resend: (gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) => AsyncGenerator<StreamMessage>,
        getStorageNodeAddresses: () => Promise<EthereumAddress[]>,
        strategy: GapFillStrategy = 'light'
    ) => {
        const filler = new GapFiller({
            chain,
            resend,
            getStorageNodeAddresses,
            strategy,
            initialWaitTime: INITIAL_WAIT_TIME,
            retryWaitTime: 20,
            maxRequestsPerGap: MAX_REQUESTS_PER_GAP,
            abortSignal: abortController.signal
        })
        filler.start()
    }
    
    const startPassiveGapFiller = () => {
        const filler = new GapFiller({
            chain,
            resend: undefined as any,
            getStorageNodeAddresses: undefined as any,
            strategy: 'light',
            initialWaitTime: INITIAL_WAIT_TIME,
            retryWaitTime: undefined as any,
            maxRequestsPerGap: 0,
            abortSignal: abortController.signal
        })
        filler.start()
    }

    const addMessages = (timestamps: number[], usePrevRefs = true) => {
        for (const timestamp of timestamps) {
            chain.addMessage(createMessage(timestamp, usePrevRefs))
        }
    }
    
    const expectOrderedMessages = async (expectedTimestamps: number[]) => {
        await waitForCondition(() => onOrderedMessageAdded.mock.calls.length === expectedTimestamps.length)
        const actualTimestamps = onOrderedMessageAdded.mock.calls.map((call) => call[0].getTimestamp())
        expect(actualTimestamps).toEqual(expectedTimestamps)
    }

    describe('active', () => {

        it('single gap', async () => {
            const storedMessages = [createMessage(2), createMessage(3)]
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            const resend = jest.fn().mockReturnValue(fromArray(storedMessages))
            startActiveGapFiller(
                resend,
                getStorageNodeAddresses
            )
            addMessages([1, 4])
            await expectOrderedMessages([1, 2, 3, 4])
            expect(getStorageNodeAddresses).toBeCalledTimes(1)
            expect(resend).toBeCalledTimes(1)
            expect(resend).toHaveBeenCalledWith(
                {
                    from: createMessage(1),
                    to: createMessage(4)
                },
                STORAGE_NODE_ADDRESS,
                expect.anything()
            )
        })

        it('multiple gaps', async () => {
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            const resend = jest.fn().mockImplementation(async function* (gap: Gap) {
                if (gap.from.getTimestamp() === 1) {
                    yield createMessage(2)
                } else if (gap.from.getTimestamp() === 3) {
                    yield createMessage(4)
                } else {
                    throw new Error('assertion failed')
                }
            })
            startActiveGapFiller(
                resend,
                getStorageNodeAddresses
            )
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 2, 3, 4, 5])
            expect(getStorageNodeAddresses).toBeCalledTimes(2)
            expect(resend).toBeCalledTimes(2)
        })

        it('partial fill', async () => {
            const storedMessages = [createMessage(3)]
            const resend = jest.fn().mockReturnValue(fromArray(storedMessages))
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            startActiveGapFiller(
                resend,
                getStorageNodeAddresses
            )
            addMessages([1, 5])
            await expectOrderedMessages([1, 3, 5])
            expect(resend).toBeCalledTimes(MAX_REQUESTS_PER_GAP)
        })

        it('realtime data resolves gap', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn()
            startActiveGapFiller(
                resend,
                getStorageNodeAddresses
            )
            addMessages([1, 3, 2])
            await expectOrderedMessages([1, 2, 3])
            expect(getStorageNodeAddresses).not.toBeCalled()
            expect(resend).not.toBeCalled()
        })

        it('no storage nodes', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([])
            startActiveGapFiller(
                resend,
                getStorageNodeAddresses,
                'full'
            )
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 3, 5])
            expect(getStorageNodeAddresses).toBeCalledTimes(2)
            expect(resend).not.toBeCalled()
        })

        it('destroy while waiting', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn()
            startActiveGapFiller(
                resend, 
                getStorageNodeAddresses,
            )
            addMessages([1, 3])
            abortController.abort()
            await expectOrderedMessages([1])
            expect(getStorageNodeAddresses).not.toBeCalled()
            expect(resend).not.toBeCalled()
        })

        it('destroy while ongoing gap fill', async () => {
            let resendAborted = false
            // eslint-disable-next-line require-yield
            const resend = async function* (
                _gap: Gap,
                _storageNodeAddress: EthereumAddress, 
                abortSignal: AbortSignal
            ) {
                const defer = new Defer<undefined>()
                abortSignal.addEventListener('abort', () => {
                    resendAborted = true
                    defer.resolve(undefined)
                })
                await defer
            }
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            startActiveGapFiller(
                resend,
                getStorageNodeAddresses,
            )
            addMessages([1, 3])
            await wait(INITIAL_WAIT_TIME * 1.1)
            abortController.abort()
            await expectOrderedMessages([1])
            expect(resendAborted).toBeTrue()
        })
    })

    describe('passive', () => {

        it('single gap', async () => {
            startPassiveGapFiller()
            addMessages([1, 3])
            await expectOrderedMessages([1, 3])
        })

        it('multiple gaps', async () => {
            startPassiveGapFiller()
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 3, 5])
        })

        it('realtime data resolves gap', async () => {
            startPassiveGapFiller()
            addMessages([1, 3, 2])
            await expectOrderedMessages([1, 2, 3])
        })

        it('abort while waiting', async () => {
            startPassiveGapFiller()
            addMessages([1, 3])
            abortController.abort()
            await expectOrderedMessages([1])
        })

    })
})
