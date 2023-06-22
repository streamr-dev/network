import { MessageID, MessageRef, StreamMessage, StreamPartIDUtils } from '@streamr/protocol'
import { Defer, EthereumAddress, toEthereumAddress, wait, waitForCondition } from '@streamr/utils'
import { GapFilledMessageChain } from '../../src/subscribe/ordering/GapFilledMessageChain'
import { Gap } from '../../src/subscribe/ordering/OrderedMessageChain'
import { fromArray } from '../../src/utils/GeneratorUtils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')
const PUBLISHER_ID = toEthereumAddress('0x0000000000000000000000000000000000000001')
const MSG_CHAIN_ID = 'msgChainId'
const STORAGE_NODE_ADDRESS = toEthereumAddress('0x0000000000000000000000000000000000000002')

const createMessage = (timestamp: number, hasPrevRef = true) => {
    return new StreamMessage({
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
            timestamp,
            0,
            PUBLISHER_ID, 
            MSG_CHAIN_ID
        ),
        prevMsgRef: hasPrevRef ? new MessageRef(timestamp - 1, 0) : null,
        content: '{}',
        signature: 'signature'
    })
}

const MAX_REQUESTS_PER_GAP = 3
const INITIAL_WAIT_TIME = 50

describe('gap fill', () => {

    let chain: GapFilledMessageChain
    const onOrderedMessageAdded = jest.fn()

    const createChainWithActiveGapFill = (
        resend: (gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) => AsyncGenerator<StreamMessage>,
        getStorageNodeAddresses: () => Promise<EthereumAddress[]>
    ) => {
        chain = new GapFilledMessageChain({
            streamPartId: STREAM_PART_ID,
            resend,
            getStorageNodeAddresses,
            initialWaitTime: INITIAL_WAIT_TIME,
            retryWaitTime: 20,
            maxRequestsPerGap: MAX_REQUESTS_PER_GAP,
        })
        chain.on('orderedMessageAdded', onOrderedMessageAdded)
    }
    
    const createChainWithPassiveGapFill = () => {
        chain = new GapFilledMessageChain({
            streamPartId: STREAM_PART_ID,
            resend: undefined as any,
            getStorageNodeAddresses: undefined as any,
            initialWaitTime: INITIAL_WAIT_TIME,
            retryWaitTime: undefined as any,
            maxRequestsPerGap: 0,
        })
        chain.on('orderedMessageAdded', onOrderedMessageAdded)
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
            createChainWithActiveGapFill(
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
            createChainWithActiveGapFill(
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
            createChainWithActiveGapFill(
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
            createChainWithActiveGapFill(
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
            createChainWithActiveGapFill(
                resend,
                getStorageNodeAddresses
            )
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 3, 5])
            expect(getStorageNodeAddresses).toBeCalledTimes(2)
            expect(resend).not.toBeCalled()
        })

        it('destroy while waiting', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn()
            createChainWithActiveGapFill(
                resend, 
                getStorageNodeAddresses,
            )
            addMessages([1, 3])
            chain.destroy()
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
            createChainWithActiveGapFill(
                resend,
                getStorageNodeAddresses,
            )
            addMessages([1, 3])
            await wait(INITIAL_WAIT_TIME * 1.1)
            chain.destroy()
            await expectOrderedMessages([1])
            expect(resendAborted).toBeTrue()
        })
    })

    describe('passive', () => {

        it('single gap', async () => {
            createChainWithPassiveGapFill()
            addMessages([1, 3])
            await expectOrderedMessages([1, 3])
        })

        it('multiple gaps', async () => {
            createChainWithPassiveGapFill()
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 3, 5])
        })

        it('realtime data resolves gap', async () => {
            createChainWithPassiveGapFill()
            addMessages([1, 3, 2])
            await expectOrderedMessages([1, 2, 3])
        })

        it('abort while waiting', async () => {
            createChainWithPassiveGapFill()
            addMessages([1, 3])
            chain.destroy()
            await expectOrderedMessages([1])
        })

    })
})
