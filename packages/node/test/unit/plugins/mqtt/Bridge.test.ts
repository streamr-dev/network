import { StreamrClient, Subscription } from '@streamr/sdk'
import { toStreamID, toStreamPartID } from '@streamr/utils'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'
import { Bridge } from '../../../../src/plugins/mqtt/Bridge'

const MOCK_TOPIC = 'mock-topic'
const MOCK_STREAM_ID_DOMAIN = 'mock.ens'
const MOCK_STREAM_ID = `${MOCK_STREAM_ID_DOMAIN}/${MOCK_TOPIC}`
const MOCK_CONTENT = { foo: 'bar' }
const MOCK_CLIENT_ID = 'mock-client-id'

const MOCK_MESSAGE_ID = {
    streamId: MOCK_STREAM_ID,
    streamPartition: 0,
    publisherId: 'mock-publisher-id',
    msgChainId: 'mock-msgChain-id'
}

describe('MQTT Bridge', () => {
    let streamrClient: Partial<StreamrClient>
    let subscription: Pick<Subscription, 'streamPartId' | 'unsubscribe'>

    beforeEach(() => {
        subscription = {
            streamPartId: toStreamPartID(toStreamID(MOCK_STREAM_ID), 0),
            unsubscribe: jest.fn().mockResolvedValue(undefined)
        }
        streamrClient = {
            publish: jest.fn().mockResolvedValue({
                messageId: MOCK_MESSAGE_ID
            }),
            subscribe: jest.fn().mockResolvedValue(subscription),
            unsubscribe: jest.fn().mockResolvedValue(undefined)
        }
    })

    describe.each([
        [MOCK_STREAM_ID_DOMAIN, MOCK_TOPIC],
        [undefined, MOCK_STREAM_ID]
    ])('streamIdDomain: %p', (streamIdDomain: string | undefined, topic: string) => {
        let bridge: Bridge

        beforeEach(() => {
            bridge = new Bridge(streamrClient as any, undefined as any, new PlainPayloadFormat(), streamIdDomain)
        })

        it('onMessageReceived', async () => {
            await bridge.onMessageReceived(topic, JSON.stringify(MOCK_CONTENT), MOCK_CLIENT_ID)
            expect(streamrClient.publish).toHaveBeenCalledWith(
                { id: MOCK_STREAM_ID, partition: undefined },
                MOCK_CONTENT,
                {
                    msgChainId: expect.any(String)
                }
            )
        })

        it('onSubscribed', async () => {
            await bridge.onSubscribed(topic, MOCK_CLIENT_ID)
            expect(streamrClient.subscribe).toHaveBeenCalledWith(`${MOCK_STREAM_ID}#0`, expect.anything())
        })

        it('onUnsubscribed', async () => {
            await bridge.onSubscribed(topic, MOCK_CLIENT_ID)
            bridge.onUnsubscribed(topic, MOCK_CLIENT_ID)
            expect(subscription.unsubscribe).toHaveBeenCalled()
        })
    })

    describe('msgChain', () => {
        let bridge: Bridge

        beforeEach(() => {
            bridge = new Bridge(streamrClient as any, undefined as any, new PlainPayloadFormat(), undefined)
        })

        it('constant between publish calls', async () => {
            await bridge.onMessageReceived(MOCK_TOPIC, JSON.stringify(MOCK_CONTENT), MOCK_CLIENT_ID)
            await bridge.onMessageReceived(MOCK_TOPIC, JSON.stringify(MOCK_CONTENT), MOCK_CLIENT_ID)
            const firstMessageMsgChainId = (streamrClient.publish as any).mock.calls[0][2].msgChainId
            const secondMessageMsgChainId = (streamrClient.publish as any).mock.calls[1][2].msgChainId
            expect(firstMessageMsgChainId).toBe(secondMessageMsgChainId)
        })

        it('different for each connection', async () => {
            await bridge.onMessageReceived(MOCK_TOPIC, JSON.stringify(MOCK_CONTENT), MOCK_CLIENT_ID)
            await bridge.onMessageReceived(MOCK_TOPIC, JSON.stringify(MOCK_CONTENT), 'other-client-id')
            const firstMessageMsgChainId = (streamrClient.publish as any).mock.calls[0][2].msgChainId
            const secondMessageMsgChainId = (streamrClient.publish as any).mock.calls[1][2].msgChainId
            expect(firstMessageMsgChainId).not.toBe(secondMessageMsgChainId)
        })
    })

    describe('partition', () => {
        let bridge: Bridge

        beforeEach(() => {
            bridge = new Bridge(streamrClient as any, undefined as any, new PlainPayloadFormat(), undefined)
        })

        it('publish with partition', async () => {
            await bridge.onMessageReceived(`${MOCK_TOPIC}?partition=5`, JSON.stringify(MOCK_CONTENT), MOCK_CLIENT_ID)
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_TOPIC,
                    partition: 5
                },
                MOCK_CONTENT,
                {
                    msgChainId: MOCK_CLIENT_ID,
                    timestamp: undefined
                }
            )
        })

        it('publish with partition key', async () => {
            await bridge.onMessageReceived(
                `${MOCK_TOPIC}?partitionKey=mock-key`,
                JSON.stringify(MOCK_CONTENT),
                MOCK_CLIENT_ID
            )
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_TOPIC,
                    partition: undefined
                },
                MOCK_CONTENT,
                {
                    partitionKey: 'mock-key',
                    msgChainId: MOCK_CLIENT_ID,
                    timestamp: undefined
                }
            )
        })

        it('publish with partition key field', async () => {
            await bridge.onMessageReceived(
                `${MOCK_TOPIC}?partitionKeyField=foo`,
                JSON.stringify(MOCK_CONTENT),
                MOCK_CLIENT_ID
            )
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_TOPIC,
                    partition: undefined
                },
                MOCK_CONTENT,
                {
                    partitionKey: MOCK_CONTENT.foo,
                    msgChainId: MOCK_CLIENT_ID,
                    timestamp: undefined
                }
            )
        })

        it('subscribe', async () => {
            await bridge.onSubscribed(`${MOCK_TOPIC}?partition=5`, MOCK_CLIENT_ID)
            expect(streamrClient.subscribe).toHaveBeenCalledWith(`${MOCK_TOPIC}#5`, expect.anything())
        })
    })
})
