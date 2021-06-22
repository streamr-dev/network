import { StreamrClient } from 'streamr-client'
import { Bridge } from '../../../../src/plugins/mqtt/Bridge'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'

const MOCK_TOPIC = 'mock-topic'
const MOCK_STREAM_ID_DOMAIN = 'mock.ens'
const MOCK_STREAM_ID = `${MOCK_STREAM_ID_DOMAIN}/${MOCK_TOPIC}`
const MOCK_CONTENT = { foo: 'bar' }

describe('MQTT Bridge', () => {

    describe.each([
        [MOCK_STREAM_ID_DOMAIN, MOCK_TOPIC],
        [undefined, MOCK_STREAM_ID]
    ])('streamIdDomain: %p', (streamIdDomain: string|undefined, topic: string) => {

        let bridge: Bridge
        let streamrClient: Partial<StreamrClient>

        beforeEach(() => {
            streamrClient = {
                publish: jest.fn().mockResolvedValue(undefined),
                subscribe: jest.fn().mockResolvedValue(undefined),
                unsubscribe: jest.fn().mockResolvedValue(undefined)
            }
            bridge = new Bridge(streamrClient as any, undefined as any, new PlainPayloadFormat(), streamIdDomain)
        })

        it('onMessageReceived', () => {
            bridge.onMessageReceived(topic, JSON.stringify(MOCK_CONTENT))
            expect(streamrClient.publish).toBeCalledWith(MOCK_STREAM_ID, MOCK_CONTENT, undefined)
        })

        it('onSubscribed', () => {
            bridge.onSubscribed(topic)
            expect(streamrClient.subscribe).toBeCalledWith(MOCK_STREAM_ID, expect.anything())
        })

        it('onUnsubscribed', () => {
            const subscription = {
                streamId: MOCK_STREAM_ID
            }
            streamrClient.getSubscriptions = jest.fn().mockReturnValue([subscription])
            bridge.onUnsubscribed(topic)
            expect(streamrClient.unsubscribe).toBeCalledWith(subscription)
        })
    
    })
})