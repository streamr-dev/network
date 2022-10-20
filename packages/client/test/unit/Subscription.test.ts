import { StreamPartIDUtils } from 'streamr-client-protocol'
import { fastWallet, waitForCondition } from 'streamr-test-utils'
import { createMockMessage, mockLoggerFactory } from '../test-utils/utils'
import { Subscription } from './../../src/subscribe/Subscription'

const waitForCalls = async (onMessage: jest.Mock<any>, n: number) => {
    await waitForCondition(() => onMessage.mock.calls.length >= n, 1000, 100, () => {
        return `Timeout while waiting for calls: got ${onMessage.mock.calls.length} out of ${n}`
    })
}

describe('Subscription', () => {

    it('onMessage', async () => {
        const subscription = new Subscription<any>(undefined as any, mockLoggerFactory())
        const onMessage = jest.fn()
        subscription.useLegacyOnMessageHandler(onMessage)
        const msg = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: fastWallet(),
        })
        subscription.push(msg)
        await waitForCalls(onMessage, 1)
        expect(onMessage).toBeCalledTimes(1)
        expect(onMessage).toHaveBeenNthCalledWith(1, msg.getParsedContent(), msg)
    })
})
