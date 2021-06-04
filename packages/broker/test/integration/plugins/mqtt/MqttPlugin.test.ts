import { StreamrClient } from 'streamr-client'
import { AsyncMqttClient } from 'async-mqtt'
import { Wallet } from 'ethers'
import { waitForCondition } from 'streamr-test-utils'
import { startTracker, Tracker } from 'streamr-network'
import mqtt from 'async-mqtt'
import { Broker } from '../../../../src/broker'
import { createMockUser, createClient, startBroker } from '../../../utils'

const MQTT_PORT = 1884
const WS_PORT = 12395
const TRACKER_PORT = 12396
const NETWORK_PORT = 12397
const MOCK_API_KEY = 'mock-api-key'

const createMqttClient = () => {
    return mqtt.connectAsync('mqtt://localhost:' + MQTT_PORT, {
        username: '',
        password: MOCK_API_KEY,
    })
}

describe('MQTT plugin', () => {

    let streamrClient: StreamrClient
    let mqttClient: AsyncMqttClient
    let user: Wallet
    let topic: string
    let tracker: Tracker
    let broker: Broker

    const getStreamId = () => user.address + '/' + topic

    beforeAll(async () => {
        user = createMockUser()
        tracker = await startTracker({
            id: 'tracker',
            host: '127.0.0.1',
            port: TRACKER_PORT,
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: user.privateKey,
            networkPort: NETWORK_PORT,
            trackerPort: TRACKER_PORT,
            wsPort: WS_PORT,
            extraPlugins: {
                mqtt: {
                    port: MQTT_PORT,
                    streamIdDomain: user.address
                }
            },
            apiAuthentication: {
                keys: [MOCK_API_KEY]
            }
        })
    })

    afterAll(async () => {
        await Promise.allSettled([
            broker.close(),
            tracker.stop()
        ])
    })

    beforeEach(async () => {
        streamrClient = createClient(WS_PORT, user.privateKey, {
            autoDisconnect: false
        })
        mqttClient = await createMqttClient()
        topic = 'topic-' + Date.now()
        await streamrClient.createStream({
            id: getStreamId()
        })
    })

    afterEach(async () => {
        await Promise.allSettled([
            mqttClient.end(true),
            streamrClient.ensureDisconnected()
        ])
    })

    test('publish on MQTT client', async () => {
        const createPayload = () => {
            const message = {
                foo: 'from-client'
            }
            return JSON.stringify({
                message
            })
        }
        let receivedMessage: any
        await streamrClient.subscribe({
            stream: getStreamId()
        }, (message: any) => {
            receivedMessage = message
        })
        mqttClient.publish(topic, createPayload())
        await waitForCondition(() => receivedMessage !== undefined)
        expect(receivedMessage.foo).toBe('from-client')
    })

    test('subscribe on MQTT client', async () => {
        let receivedTopic: string|undefined
        let receivedJson: any 
        mqttClient.on('message', (topic: string, payload: Buffer) => {
            receivedTopic = topic
            receivedJson = JSON.parse(payload.toString())
        })
        await mqttClient.subscribe(topic)
        await streamrClient.publish(getStreamId(), {
            foo: 'to-client'
        })
        await waitForCondition(() => receivedJson !== undefined)
        expect(receivedTopic).toBe(topic)
        expect(receivedJson.message.foo).toBe('to-client')
        expect(receivedJson.metadata.timestamp).toBeDefined()
    })
})
