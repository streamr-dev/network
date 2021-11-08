import { Stream, StreamrClient } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import mqtt from 'async-mqtt'
import { Broker } from '../../../../src/broker'
import { createClient, startBroker, createTestStream, createMockUser, Queue } from '../../../utils'
import { wait } from 'streamr-test-utils'

const MQTT_PLUGIN_PORT = 12470
const TRACKER_PORT = 12471

const createMqttClient = () => {
    return mqtt.connectAsync('mqtt://localhost:' + MQTT_PLUGIN_PORT)
}

describe('MQTT Bridge', () => {
    let stream: Stream
    let streamrClient: StreamrClient
    let tracker: Tracker
    let broker: Broker
    const brokerUser = createMockUser()

    const createSubscriber = async (messageQueue: Queue<any>) => {
        const subscriber = await createMqttClient()
        subscriber.on('message', (_topic, message) => messageQueue.push(JSON.parse(message.toString())))
        subscriber.subscribe(stream.id)
        return subscriber
    }

    beforeAll(async () => {
        tracker = await startTracker({
            id: 'tracker-1',
            listen: {
                hostname: '127.0.0.1',
                port: TRACKER_PORT
            },
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: brokerUser.privateKey,
            trackerPort: TRACKER_PORT,
            extraPlugins: {
                mqtt: {
                    port: MQTT_PLUGIN_PORT
                }
            }
        })
    })

    afterAll(async () => {
        await Promise.allSettled([
            broker.stop(),
            tracker.stop()
        ])
    })

    beforeEach(async () => {
        streamrClient = createClient(tracker, brokerUser.privateKey)
        stream = await createTestStream(streamrClient, module)
    })

    afterEach(async () => {
        streamrClient?.debug('destroy after test')
        await streamrClient?.destroy()
    })

    test('message published by a MQTT client is delivered only once', async () => {
        const message = {
            foo: Date.now()
        }
        const messageQueue = new Queue<any>()
        const subscriber = await createSubscriber(messageQueue)

        const publisher = await createMqttClient()
        publisher.publish(stream.id, JSON.stringify(message))
        await wait(1000)

        expect(messageQueue.items).toEqual([message])

        await Promise.allSettled([
            subscriber.end(true),
            publisher.end(true)
        ])
    })

    test('message published by a StreamrClient is delivered', async () => {
        const expected = {
            foo: Date.now()
        }
        const messageQueue = new Queue<any>()
        const subscriber = await createSubscriber(messageQueue)
        streamrClient.publish(stream.id, expected)

        const actual = await messageQueue.pop()
        expect(actual).toEqual(expected)

        await subscriber.end(true)
    })
})