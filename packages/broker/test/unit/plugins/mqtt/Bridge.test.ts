import { StreamrClient, Subscription } from 'streamr-client'
import { toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { Bridge } from '../../../../src/plugins/mqtt/Bridge'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'

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

    describe.each([
        [MOCK_STREAM_ID_DOMAIN, MOCK_TOPIC],
        [undefined, MOCK_STREAM_ID]
    ])('streamIdDomain: %p', (streamIdDomain: string|undefined, topic: string) => {

        let bridge: Bridge
        let streamrClient: Partial<StreamrClient>
        let subscription: Pick<Subscription, 'streamPartId'|'unsubscribe'>

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
            bridge = new Bridge(streamrClient as any, undefined as any, new PlainPayloadFormat(), streamIdDomain)
        })

        it('onMessageReceived', async () => {
            await bridge.onMessageReceived(topic, JSON.stringify(MOCK_CONTENT))
            expect(streamrClient.publish).toBeCalledWith(MOCK_STREAM_ID, MOCK_CONTENT, {})
        })

        it('onSubscribed', async () => {
            await bridge.onSubscribed(topic, MOCK_CLIENT_ID)
            expect(streamrClient.subscribe).toBeCalledWith(MOCK_STREAM_ID, expect.anything())
        })

        it('onUnsubscribed', async () => {
            await bridge.onSubscribed(topic, MOCK_CLIENT_ID)
            await bridge.onUnsubscribed(topic, MOCK_CLIENT_ID)
            expect(subscription.unsubscribe).toBeCalled()
        })
    
    })
})
