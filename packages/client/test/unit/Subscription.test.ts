import { Subscription, MessageListener } from './../../src/subscribe/Subscription'
import { toEthereumAddress } from '@streamr/utils'
import { createRandomAuthentication, mockLoggerFactory } from '../test-utils/utils'
import { Msg } from '../test-utils/publish'
import { MessageID, toStreamID } from 'streamr-client-protocol'
import { Readable } from 'stream'
import { waitForCondition } from 'streamr-test-utils'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import { Authentication } from '../../src/Authentication'

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

const fromReadable = async (readable: Readable, onMessage?: MessageListener<any>) => {
    const result = new Subscription<any>(undefined as any, mockLoggerFactory())
    if (onMessage !== undefined) {
        result.useLegacyOnMessageHandler(onMessage)
    }
    result.pull((async function* readStream() {
        try {
            yield* readable
        } finally {
            readable.destroy()
        }
    }()))
    return result
}

const waitForCalls = async (onMessage: jest.Mock<any>, n: number) => {
    await waitForCondition(() => onMessage.mock.calls.length >= n, 1000, 100, () => {
        return `Timeout while waiting for calls: got ${onMessage.mock.calls.length} out of ${n}`
    })
}

describe('Subscription', () => {

    const streamId = toStreamID('streamId')
    let authentication: Authentication

    beforeEach(async () => {
        authentication = createRandomAuthentication()
    })

    const createMockMessage = async () => {
        return await createSignedMessage({
            messageId: new MessageID(streamId, 0, 0, 0, PUBLISHER_ID, 'msgChainId'),
            serializedContent: JSON.stringify(Msg()),
            authentication
        })
    }

    describe('onMessage', () => {

        it('push', async () => {
            const subscription = new Subscription<any>(undefined as any, mockLoggerFactory())
            const onMessage = jest.fn()
            subscription.useLegacyOnMessageHandler(onMessage)
            const msg = await createMockMessage()
            subscription.push(msg)
            await waitForCalls(onMessage, 1)
            expect(onMessage).toBeCalledTimes(1)
            expect(onMessage).toHaveBeenNthCalledWith(1, msg.getParsedContent(), msg)
        })

        it('from readable', async () => {
            const msg1 = await createMockMessage()
            const msg2 = await createMockMessage()
            const readable = Readable.from([msg1, msg2], { objectMode: true })
            const onMessage = jest.fn()
            fromReadable(readable, onMessage)
            await waitForCalls(onMessage, 2)
            expect(onMessage).toHaveBeenNthCalledWith(1, msg1.getParsedContent(), msg1)
            expect(onMessage).toHaveBeenNthCalledWith(2, msg2.getParsedContent(), msg2)
        })
    })
})
