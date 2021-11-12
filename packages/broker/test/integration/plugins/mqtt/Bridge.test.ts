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

    test('message should be delivered once per client if subscribed by multiple clients', async () => {
        const expected = {
            foo: Date.now()
        }
        const messageQueue1 = new Queue<any>()
        const messageQueue2 = new Queue<any>()
        const subscriber1 = await createSubscriber(messageQueue1)
        const subscriber2 = await createSubscriber(messageQueue2)
        streamrClient.publish(stream.id, expected)

        await wait(2000)
        expect(messageQueue1.items).toEqual([expected])
        expect(messageQueue2.items).toEqual([expected])

        await Promise.allSettled([
            subscriber1.end(true),
            subscriber2.end(true)
        ])
    })

    it('subscription should not be unsubscribed if it was not subscribed by that client', async () => {
        const expected = {
            foo: Date.now()
        }
        const messageQueue = new Queue<any>()
        const subscriber1 = await createSubscriber(messageQueue)
        const subscriber2 = await createMqttClient()
        subscriber2.unsubscribe(stream.id)
        streamrClient.publish(stream.id, expected)

        await wait(2000)
        expect(messageQueue.items).toEqual([expected])

        await Promise.allSettled([
            subscriber1.end(true),
            subscriber2.end(true)
        ])
    })

    test('message should be delivered to remaining subscribers if one subscriber unsubscribes', async () => {
        const expected = {
            foo: Date.now()
        }
        const messageQueue1 = new Queue<any>()
        const messageQueue2 = new Queue<any>()
        const subscriber1 = await createSubscriber(messageQueue1)
        const subscriber2 = await createSubscriber(messageQueue2)
        subscriber2.unsubscribe(stream.id)
        streamrClient.publish(stream.id, expected)

        await wait(2000)
        expect(messageQueue1.items).toEqual([expected])
        expect(messageQueue2.items).toEqual([])

        await Promise.allSettled([
            subscriber1.end(true),
            subscriber2.end(true)
        ])
    })
})