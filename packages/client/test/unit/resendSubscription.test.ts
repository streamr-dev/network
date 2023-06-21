import { StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { Queue } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import last from 'lodash/last'
import { Message } from '../../src/Message'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { ResendRangeOptions } from '../../src/subscribe/Resends'
import { Subscription, SubscriptionEvents } from '../../src/subscribe/Subscription'
import { initResendSubscription } from '../../src/subscribe/resendSubscription'
import { PushPipeline } from '../../src/utils/PushPipeline'
import { createGroupKeyQueue, createRandomAuthentication, createStreamRegistryCached, mockLoggerFactory } from '../test-utils/utils'

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

const waitForMatchingItem = async (streamMessage: StreamMessage, queue: Queue<Message>) => {
    await waitForCondition(() => {
        return queue.values().some((msg) => msg.content === streamMessage.getParsedContent())
    })
}

const expectEqualMessageCollections = (actual: Iterable<Message>, expected: StreamMessage[]) => {
    expect(Array.from(actual).map((m) => m.content)).toEqual(expected.map((m) => m.getParsedContent()))
}

const startConsuming = (sub: Subscription, outputMessages: Queue<Message>) => {
    setImmediate(() => outputMessages.collect(sub))
}

describe('resend subscription', () => {

    let messageFactory: MessageFactory

    beforeEach(async () => {
        const authentication = createRandomAuthentication()
        messageFactory = new MessageFactory({
            authentication,
            streamId: StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            streamRegistry: createStreamRegistryCached({
                isPublicStream: true
            }),
            groupKeyQueue: await createGroupKeyQueue(authentication)
        })
    })

    const createMessages = async (type: string, msgChainId?: string): Promise<StreamMessage[]> => {
        const MESSAGE_COUNT = 3
        const result: StreamMessage[] = []
        for (let i = 0; i < MESSAGE_COUNT; i++) {
            const msgId = `${type}${(msgChainId !== undefined) ? ('-' + msgChainId) : ''}-${(i + 1)}`
            result.push(await messageFactory.createMessage({ msgId }, { timestamp: Date.now(), msgChainId }))
        }
        return result
    }

    const createSubscription = (
        resend: () => Promise<PushPipeline<StreamMessage, StreamMessage>>,
        gapFill = true
    ) => {
        const eventEmitter = new EventEmitter<SubscriptionEvents>()
        const sub = new Subscription(STREAM_PART_ID, false, eventEmitter, mockLoggerFactory())
        initResendSubscription(
            sub,
            undefined as any,
            {
                resend
            } as any,
            {
                orderMessages: true,
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
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline(historicalMessages))
            .mockImplementationOnce(() => createPushPipeline(gapMessages))
        const sub = createSubscription(resend)
        let latestMessageWhenResendComplete: Message
        const onResendComplete = jest.fn().mockImplementation(
            () => latestMessageWhenResendComplete = last(outputMessages.values())!
        )
        sub.on('resendComplete', onResendComplete)
        startConsuming(sub, outputMessages)

        const bufferedRealtimeMessages = await createMessages('bufferedRealtime')
        for await (const msg of bufferedRealtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(bufferedRealtimeMessages)!, outputMessages)
        const immediateRealtimeMessages = await createMessages('immediateRealtime')
        for await (const msg of immediateRealtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(immediateRealtimeMessages)!, outputMessages)
        await sub.unsubscribe()

        const expectedMessages = [
            ...historicalMessages,
            ...gapMessages,
            ...bufferedRealtimeMessages,
            ...immediateRealtimeMessages
        ]
        expect(outputMessages.values().map((m) => m.content)).toEqual(expectedMessages.map((m) => m.getParsedContent()))
        expect(onResendComplete).toBeCalledTimes(1)
        expect(latestMessageWhenResendComplete!.content).toEqual(last(historicalMessages)!.getParsedContent())
    })

    it('gap not fillable', async () => {
        const historicalMessages = await createMessages('historical')
        await createMessages('gap')
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline(historicalMessages))
            .mockImplementationOnce(() => createPushPipeline([]))
            .mockImplementationOnce(() => createPushPipeline([]))
        const sub = createSubscription(resend)
        startConsuming(sub, outputMessages)
        
        const realtimeMessages = await createMessages('realtime')
        for await (const msg of realtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(realtimeMessages)!, outputMessages)
        await sub.unsubscribe()

        const expectedMessages = [
            ...historicalMessages,
            ...realtimeMessages
        ]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(resend).toBeCalledTimes(MAX_GAP_REQUESTS + 1)  // the historical messages fetch and all gap fill tries
    })

    it('no historical data', async () => {
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline([]))
        const sub = createSubscription(resend)
        startConsuming(sub, outputMessages)

        const realtimeMessages = await createMessages('realtime')
        for await (const msg of realtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(realtimeMessages)!, outputMessages)
        await sub.unsubscribe()

        expectEqualMessageCollections(outputMessages, realtimeMessages)
        expect(resend).toBeCalledTimes(1)  // the historical messages fetch
    })

    it('gap fill disabled', async () => {
        const historicalMessages = await createMessages('historical')
        await createMessages('gap')
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline(historicalMessages))
        const sub = createSubscription(resend, false)
        startConsuming(sub, outputMessages)

        const realtimeMessages = await createMessages('realtime')
        for await (const msg of realtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(realtimeMessages)!, outputMessages)
        await sub.unsubscribe()

        const expectedMessages = [
            ...historicalMessages,
            ...realtimeMessages
        ]
        expectEqualMessageCollections(outputMessages, expectedMessages)
        expect(resend).toBeCalledTimes(1)  // the historical messages fetch
    })

    it('multiple message chains', async () => {
        const msgChainIds = ['chain1', 'chain2']
        const historicalMessages1 = await createMessages('historical1', msgChainIds[0])
        const historicalMessages2 = await createMessages('historical1', msgChainIds[1])
        const gapMessages1 = await createMessages('gap1', msgChainIds[0])
        const gapMessages2 = await createMessages('gap2', msgChainIds[1])
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline(historicalMessages1.concat(historicalMessages2)))
            .mockImplementation((_streamPartId: StreamPartID, opts: ResendRangeOptions) => {
                if (opts.msgChainId === msgChainIds[0]) {
                    return createPushPipeline(gapMessages1)
                } else if (opts.msgChainId === msgChainIds[1]) {
                    return createPushPipeline(gapMessages2)
                }
            })
        const sub = createSubscription(resend)
        startConsuming(sub, outputMessages)

        const realtimeMessages1 = await createMessages('realtime1', msgChainIds[0])
        const realtimeMessages2 = await createMessages('realtime1', msgChainIds[1])
        for await (const msg of realtimeMessages1.concat(realtimeMessages2)) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(realtimeMessages1)!, outputMessages)
        await waitForMatchingItem(last(realtimeMessages2)!, outputMessages)
        await sub.unsubscribe()

        const expectedMessages1 = [
            ...historicalMessages1,
            ...gapMessages1,
            ...realtimeMessages1
        ]
        const expectedMessages2 = [
            ...historicalMessages2,
            ...gapMessages2,
            ...realtimeMessages2
        ]
        expectEqualMessageCollections(outputMessages.values().filter((m) => m.msgChainId === msgChainIds[0]), expectedMessages1)
        expectEqualMessageCollections(outputMessages.values().filter((m) => m.msgChainId === msgChainIds[1]), expectedMessages2)
        expect(resend).toBeCalledTimes(3)  // the historical messages fetch and one gap fill for each message chain
    })

    it('ignore duplicate', async () => {
        const historicalMessages = await createMessages('historical')
        const gapMessages = await createMessages('gap')
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline(historicalMessages))
            .mockImplementationOnce(() => createPushPipeline(gapMessages))
        const sub = createSubscription(resend)
        startConsuming(sub, outputMessages)

        await sub.push(historicalMessages[0])
        await sub.push(gapMessages[0])
        const realtimeMessages = await createMessages('realtime')
        for await (const msg of realtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(realtimeMessages)!, outputMessages)
        await sub.unsubscribe()

        const expectedMessages = [
            ...historicalMessages,
            ...gapMessages,
            ...realtimeMessages,
        ]
        expect(outputMessages.values().map((m) => m.content)).toEqual(expectedMessages.map((m) => m.getParsedContent()))
    })

    it('real-time resolves gap', async () => {
        const historicalMessages = await createMessages('historical')
        const gapMessages = await createMessages('gap')
        const outputMessages: Queue<Message> = new Queue()
        const resend = jest.fn()
            .mockImplementationOnce(() => createPushPipeline(historicalMessages))
        const sub = createSubscription(resend)
        startConsuming(sub, outputMessages)

        for await (const msg of gapMessages) {
            await sub.push(msg)
        }
        const realtimeMessages = await createMessages('realtime')
        for await (const msg of realtimeMessages) {
            await sub.push(msg)
        }
        await waitForMatchingItem(last(realtimeMessages)!, outputMessages)
        await sub.unsubscribe()

        const expectedMessages = [
            ...historicalMessages,
            ...gapMessages,
            ...realtimeMessages,
        ]
        expect(outputMessages.values().map((m) => m.content)).toEqual(expectedMessages.map((m) => m.getParsedContent()))
        expect(resend).toBeCalledTimes(1)  // the historical messages fetch
    })

})
