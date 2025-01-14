import {
    Defer,
    EthereumAddress,
    StreamPartIDUtils,
    hexToBinary,
    toEthereumAddress,
    utf8ToBinary,
    wait,
    until
} from '@streamr/utils'
import { GapFillStrategy, GapFiller } from '../../src/subscribe/ordering/GapFiller'
import { Gap, OrderedMessageChain } from '../../src/subscribe/ordering/OrderedMessageChain'
import { fromArray } from '../../src/utils/GeneratorUtils'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from './../../src/protocol/StreamMessage'
import { randomUserId } from '@streamr/test-utils'

const CONTEXT = {
    streamPartId: StreamPartIDUtils.parse('stream#0'),
    publisherId: randomUserId(),
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
        prevMsgRef: hasPrevRef ? new MessageRef(timestamp - 1, 0) : undefined,
        content: utf8ToBinary('{}'),
        signature: hexToBinary('0x1324'),
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1
    })
}

const MAX_REQUESTS_PER_GAP = 3
const INITIAL_WAIT_TIME = 50

describe('GapFiller', () => {
    let chain: OrderedMessageChain
    let onOrderedMessageAdded: jest.Mock<(msg: StreamMessage) => void>
    let abortController: AbortController

    beforeEach(() => {
        abortController = new AbortController()
        chain = new OrderedMessageChain(CONTEXT, abortController.signal)
        onOrderedMessageAdded = jest.fn()
        chain.on('orderedMessageAdded', onOrderedMessageAdded)
    })

    const startActiveGapFiller = (
        resend: (
            gap: Gap,
            storageNodeAddress: EthereumAddress,
            abortSignal: AbortSignal
        ) => AsyncGenerator<StreamMessage>,
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
        await until(() => onOrderedMessageAdded.mock.calls.length === expectedTimestamps.length)
        const actualTimestamps = onOrderedMessageAdded.mock.calls.map((call) => call[0].getTimestamp())
        expect(actualTimestamps).toEqual(expectedTimestamps)
    }

    describe('active', () => {
        it('single gap', async () => {
            const storedMessages = [createMessage(2), createMessage(3)]
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            const resend = jest.fn().mockReturnValue(fromArray(storedMessages))
            startActiveGapFiller(resend, getStorageNodeAddresses)
            addMessages([1, 4])
            await expectOrderedMessages([1, 2, 3, 4])
            expect(getStorageNodeAddresses).toHaveBeenCalledTimes(1)
            expect(resend).toHaveBeenCalledTimes(1)
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
            startActiveGapFiller(resend, getStorageNodeAddresses)
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 2, 3, 4, 5])
            expect(getStorageNodeAddresses).toHaveBeenCalledTimes(2)
            expect(resend).toHaveBeenCalledTimes(2)
        })

        it('partial fill', async () => {
            const storedMessages = [createMessage(3)]
            const resend = jest.fn().mockReturnValue(fromArray(storedMessages))
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            startActiveGapFiller(resend, getStorageNodeAddresses)
            addMessages([1, 5])
            await expectOrderedMessages([1, 3, 5])
            expect(resend).toHaveBeenCalledTimes(MAX_REQUESTS_PER_GAP)
        })

        it('realtime data resolves gap', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn()
            startActiveGapFiller(resend, getStorageNodeAddresses)
            addMessages([1, 3, 2])
            await expectOrderedMessages([1, 2, 3])
            expect(getStorageNodeAddresses).not.toHaveBeenCalled()
            expect(resend).not.toHaveBeenCalled()
        })

        it('no storage nodes', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([])
            startActiveGapFiller(resend, getStorageNodeAddresses, 'full')
            addMessages([1, 3, 5])
            await expectOrderedMessages([1, 3, 5])
            expect(getStorageNodeAddresses).toHaveBeenCalledTimes(2)
            expect(resend).not.toHaveBeenCalled()
        })

        it('destroy while waiting', async () => {
            const resend = jest.fn()
            const getStorageNodeAddresses = jest.fn()
            startActiveGapFiller(resend, getStorageNodeAddresses)
            addMessages([1, 3])
            abortController.abort()
            await expectOrderedMessages([1])
            expect(getStorageNodeAddresses).not.toHaveBeenCalled()
            expect(resend).not.toHaveBeenCalled()
        })

        it('destroy while ongoing gap fill', async () => {
            let resendAborted = false
            // eslint-disable-next-line require-yield
            const resend = async function* (_gap: Gap, _storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) {
                const defer = new Defer<undefined>()
                abortSignal.addEventListener('abort', () => {
                    resendAborted = true
                    defer.resolve(undefined)
                })
                await defer
            }
            const getStorageNodeAddresses = jest.fn().mockResolvedValue([STORAGE_NODE_ADDRESS])
            startActiveGapFiller(resend, getStorageNodeAddresses)
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
