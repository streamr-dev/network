import { randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress, toStreamID, toStreamPartID } from '@streamr/utils'
import { mock } from 'jest-mock-extended'
import { Subscription } from '../../src'
import { NetworkNodeFacade } from '../../src/NetworkNodeFacade'
import { MessagePipelineFactory } from '../../src/subscribe/MessagePipelineFactory'
import { SubscriptionSession } from '../../src/subscribe/SubscriptionSession'
import { PushPipeline } from '../../src/utils/PushPipeline'
import { ErrorSignal, Signal } from '../../src/utils/Signal'
import { StreamMessage } from './../../src/protocol/StreamMessage'

const STREAM_PART_ID = toStreamPartID(toStreamID('foobar.eth'), 0)
const ADDRESS_ONE = randomEthereumAddress()
const ADDRESS_TWO = randomEthereumAddress()

function createSubscription(erc1271contractAddress?: EthereumAddress): Subscription {
    return new Subscription(STREAM_PART_ID, false, erc1271contractAddress, mock(), mock())
}

describe('SubscriptionSession', () => {
    let session: SubscriptionSession

    beforeEach(() => {
        const pipelineFactory = mock<MessagePipelineFactory>()
        const pushPipeline = mock<PushPipeline<StreamMessage, StreamMessage>>()
        pushPipeline.onError = ErrorSignal.once()
        pushPipeline.onBeforeFinally = Signal.once()
        pushPipeline.pipe.mockReturnValue(pushPipeline as any)
        pipelineFactory.createMessagePipeline.mockReturnValue(pushPipeline)
        const networkNodeFacade = mock<NetworkNodeFacade>()
        session = new SubscriptionSession(STREAM_PART_ID, pipelineFactory, networkNodeFacade)
    })

    describe('getERC1271ContractAddress', () => {
        it('returns undefined if no subscriptions', () => {
            expect(session.getERC1271ContractAddress()).toBeUndefined()
        })

        it('returns undefined if does not exist on subscription', async () => {
            await session.add(createSubscription())
            expect(session.getERC1271ContractAddress()).toBeUndefined()
        })

        it('returns erc1271contractAddress if exists on subscription', async () => {
            await session.add(createSubscription(ADDRESS_ONE))
            expect(session.getERC1271ContractAddress()).toEqual(ADDRESS_ONE)
        })
    })

    it('can add multiple subscriptions without erc1271contractAddress', async () => {
        await session.add(createSubscription())
        await session.add(createSubscription())
    })

    it('can add multiple subscriptions with same erc1271contractAddress', async () => {
        await session.add(createSubscription(ADDRESS_ONE))
        await session.add(createSubscription(ADDRESS_ONE))
    })

    it('cannot subscribe with erc1271contractAddress if existing has none', async () => {
        await session.add(createSubscription())
        await expect(session.add(createSubscription(ADDRESS_ONE))).rejects.toEqual(
            new Error('Subscription ERC-1271 mismatch')
        )
    })

    it('cannot subscribe without erc1271contractAddress if existing has one', async () => {
        await session.add(createSubscription(ADDRESS_ONE))
        await expect(session.add(createSubscription())).rejects.toEqual(new Error('Subscription ERC-1271 mismatch'))
    })

    it('cannot subscribe with different erc1271contractAddress if existing has one', async () => {
        await session.add(createSubscription(ADDRESS_ONE))
        await expect(session.add(createSubscription(ADDRESS_TWO))).rejects.toEqual(
            new Error('Subscription ERC-1271 mismatch')
        )
    })
})
