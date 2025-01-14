import { Queue, randomEthereumAddress } from '@streamr/test-utils'
import { StreamPartID, StreamPartIDUtils, until } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { mock } from 'jest-mock-extended'
import { isEqual } from 'lodash'
import last from 'lodash/last'
import { Message } from '../../src/Message'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { ResendRangeOptions } from '../../src/subscribe/Resends'
import { Subscription, SubscriptionEvents } from '../../src/subscribe/Subscription'
import { initResendSubscription } from '../../src/subscribe/resendSubscription'
import { PushPipeline } from '../../src/utils/PushPipeline'
import {
    createGroupKeyQueue,
    createRandomAuthentication,
    createStreamRegistry,
    mockLoggerFactory
} from '../test-utils/utils'
import { StreamMessage } from './../../src/protocol/StreamMessage'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')
const MAX_GAP_REQUESTS = 2

const createPushPipeline = (messages: StreamMessage[]) => {
    const pipeline = new PushPipeline<StreamMessage>()
    for (const msg of messages) {
        pipeline.push(msg)
    }
    pipeline.endWrite()
    return pipeline
}

const createResend = (
    historicalMessages: StreamMessage[],
    gapHandler: (opts: ResendRangeOptions) => StreamMessage[]
) => {
    return jest
        .fn()
        .mockImplementationOnce(() => createPushPipeline(historicalMessages))
        .mockImplementation((_streamPartId: StreamPartID, opts: ResendRangeOptions) =>
            createPushPipeline(gapHandler(opts))
        )
}

const waitForMatchingItem = async (streamMessage: StreamMessage, queue: Queue<Message>) => {
    await until(() => {
        return queue.values().some((msg) => isEqual(msg.content, streamMessage.getParsedContent()))
    })
}

const expectEqualMessageCollections = (actual: Iterable<Message>, expected: StreamMessage[]) => {
    expect(Array.from(actual).map((m) => m.content)).toEqual(expected.map((m) => m.getParsedContent()))
}

describe('resend subscription', () => {
    let sub: Subscription
    let outputMessages: Queue<Message>
    let messageFactory: MessageFactory

    beforeEach(async () => {
        outputMessages = new Queue<Message>()
        const authentication = createRandomAuthentication()
        messageFactory = new MessageFactory({
            authentication,
            streamId: StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            streamRegistry: createStreamRegistry({
                isPublicStream: true
            }),
            groupKeyQueue: await createGroupKeyQueue(authentication),
            signatureValidator: mock<SignatureValidator>(),
            messageSigner: new MessageSigner(authentication)
        })
    })

    const createMessages = async (type: string, msgChainId?: string): Promise<StreamMessage[]> => {
        const MESSAGE_COUNT = 3
        const result: StreamMessage[] = []
        for (let i = 0; i < MESSAGE_COUNT; i++) {
            const msgId = `${type}${msgChainId !== undefined ? '-' + msgChainId : ''}-${i + 1}`
            result.push(await messageFactory.createMessage({ msgId }, { timestamp: Date.now(), msgChainId }))
        }
        return result
    }

    const publish = async (type: string, msgChainId?: string) => {
        const messages = await createMessages(type, msgChainId)
        for (const msg of messages) {
            await sub.push(msg)
        }
        return messages
    }

    const publishAndWaitUntilConsumed = async (type: string, msgChainId?: string) => {
        const messages = await publish(type, msgChainId)
        await waitForMatchingItem(last(messages)!, outputMessages)
        return messages
    }

    const startConsuming = () => {
        setImmediate(async () => {
            for await (const item of sub) {
                outputMessages.push(item)
            }
        })
    }

    const createSubscription = (resend: () => Promise<PushPipeline<StreamMessage, StreamMessage>>, gapFill = true) => {
        const eventEmitter = new EventEmitter<SubscriptionEvents>()
        sub = new Subscription(STREAM_PART_ID, false, undefined, eventEmitter, mockLoggerFactory())
        initResendSubscription(
            sub,
            {} as any,
            {
                resend
            } as any,
            async () => [randomEthereumAddress()],
            {
                orderMessages: true,
                gapFillStrategy: 'light',
                gapFill,
                maxGapRequests: MAX_GAP_REQUESTS,
                gapFillTimeout: 200,
                retryResendAfterTimeout: 0
            } as any,
            eventEmitter,
            mockLoggerFactory()
        )
        return sub
    }

    it('happy path', async () => {
        const historicalMessages = await createMessages('historical')
        const gapMessages = await createMessages('gap')
        const resend = createResend(historicalMessages, () => gapMessages)
        sub = createSubscription(resend)
        let latestMessageWhenResendComplete: Message
        const onResendComplete = jest
            .fn()
            .mockImplementation(() => (latestMessageWhenResendComplete = last(outputMessages.values())!))
        sub.on('resendCompleted', onResendComplete)
        startConsuming()

        const bufferedRealtimeMessages = await publishAndWaitUntilConsumed('bufferedRealtime')
        const immediateRealtimeMessages = await publishAndWaitUntilConsumed('immediateRealtime')
        await sub.unsubscribe()

        const expectedMessages = [
            ...historicalMessages,
            ...gapMessages,
            ...bufferedRealtimeMessages,
            ...immediateRealtimeMessages
        ]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(onResendComplete).toHaveBeenCalledTimes(1)
        expect(latestMessageWhenResendComplete!.content).toEqual(last(historicalMessages)!.getParsedContent())
        expect(resend).toHaveBeenCalledTimes(2) // the historical messages fetch and the gap fill
    })

    it('gap not fillable', async () => {
        const historicalMessages = await createMessages('historical')
        await createMessages('gap')
        const resend = createResend(historicalMessages, () => [])
        sub = createSubscription(resend)
        startConsuming()

        const realtimeMessages = await publishAndWaitUntilConsumed('realtime')
        await sub.unsubscribe()

        const expectedMessages = [...historicalMessages, ...realtimeMessages]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(resend).toHaveBeenCalledTimes(MAX_GAP_REQUESTS + 1) // the historical messages fetch and all gap fill tries
    })

    it('no historical data', async () => {
        const resend = createResend([], () => [])
        sub = createSubscription(resend)
        startConsuming()

        const realtimeMessages = await publishAndWaitUntilConsumed('realtime')
        await sub.unsubscribe()

        expectEqualMessageCollections(outputMessages, realtimeMessages)
        expect(resend).toHaveBeenCalledTimes(1) // the historical messages fetch
    })

    it('gap fill disabled', async () => {
        const historicalMessages = await createMessages('historical')
        const gapMessages = await createMessages('gap')
        const resend = createResend(historicalMessages, () => gapMessages)
        sub = createSubscription(resend, false)
        startConsuming()

        const realtimeMessages = await publishAndWaitUntilConsumed('realtime')
        await sub.unsubscribe()

        const expectedMessages = [...historicalMessages, ...realtimeMessages]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(resend).toHaveBeenCalledTimes(1) // the historical messages fetch
    })

    it('multiple message chains', async () => {
        const msgChainIds = ['chain1', 'chain2']
        const historicalMessages1 = await createMessages('historical1', msgChainIds[0])
        const historicalMessages2 = await createMessages('historical1', msgChainIds[1])
        const gapMessages1 = await createMessages('gap1', msgChainIds[0])
        const gapMessages2 = await createMessages('gap2', msgChainIds[1])
        const resend = createResend(historicalMessages1.concat(historicalMessages2), (opts: ResendRangeOptions) => {
            if (opts.msgChainId === msgChainIds[0]) {
                return gapMessages1
            } else if (opts.msgChainId === msgChainIds[1]) {
                return gapMessages2
            } else {
                throw new Error('assertion failed')
            }
        })
        sub = createSubscription(resend)
        startConsuming()

        const realtimeMessages1 = await publishAndWaitUntilConsumed('realtime1', msgChainIds[0])
        const realtimeMessages2 = await publishAndWaitUntilConsumed('realtime1', msgChainIds[1])
        await sub.unsubscribe()

        const expectedMessages1 = [...historicalMessages1, ...gapMessages1, ...realtimeMessages1]
        const expectedMessages2 = [...historicalMessages2, ...gapMessages2, ...realtimeMessages2]
        expectEqualMessageCollections(
            outputMessages.values().filter((m) => m.msgChainId === msgChainIds[0]),
            expectedMessages1
        )
        expectEqualMessageCollections(
            outputMessages.values().filter((m) => m.msgChainId === msgChainIds[1]),
            expectedMessages2
        )
        expect(resend).toHaveBeenCalledTimes(3) // the historical messages fetch and one gap fill for each message chain
    })

    it('ignore duplicate', async () => {
        const historicalMessages = await createMessages('historical')
        const gapMessages = await createMessages('gap')
        const resend = createResend(historicalMessages, () => gapMessages)
        sub = createSubscription(resend)
        startConsuming()

        await sub.push(historicalMessages[0])
        await sub.push(gapMessages[0])
        const realtimeMessages = await publishAndWaitUntilConsumed('realtime')
        await sub.unsubscribe()

        const expectedMessages = [...historicalMessages, ...gapMessages, ...realtimeMessages]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(resend).toHaveBeenCalledTimes(2) // the historical messages fetch and the gap fill
    })

    it('real-time resolves gap', async () => {
        const historicalMessages = await createMessages('historical')
        const resend = createResend(historicalMessages, () => [])
        sub = createSubscription(resend)
        startConsuming()

        const gapMessages = await publish('gap')
        const realtimeMessages = await publishAndWaitUntilConsumed('realtime')
        await sub.unsubscribe()

        const expectedMessages = [...historicalMessages, ...gapMessages, ...realtimeMessages]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(resend).toHaveBeenCalledTimes(1) // the historical messages fetch
    })
})
