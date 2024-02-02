import { Stream, StreamrClient } from 'streamr-client'
import mqtt from 'async-mqtt'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Broker } from '../../../../src/broker'
import { createClient, startBroker, createTestStream, KEYSERVER_PORT } from '../../../utils'
import { waitForEvent3 } from '@streamr/utils'
import { Wallet } from '@ethersproject/wallet'
import EventEmitter from 'eventemitter3'

const MQTT_PLUGIN_PORT = 12470

jest.setTimeout(30000)

const createMqttClient = () => {
    return mqtt.connectAsync(`mqtt://127.0.0.1:${MQTT_PLUGIN_PORT}`)
}

export interface SubscriberEvents {
    messageObject: (messageObject: object) => void
}
class Subscriber extends EventEmitter<SubscriberEvents> {
    private mqttClient?: mqtt.AsyncMqttClient
    public readonly receivedMessageObjects: object[] = []

    async subscribe(topic: string): Promise<void> {
        this.mqttClient = await createMqttClient()
        this.mqttClient.on('message', this.onMessage)
        await this.mqttClient.subscribe(topic)     
    }

    async unsubscribe(topic: string): Promise<void> {
        return this.mqttClient!.unsubscribe(topic)
    }

    async stop(): Promise<void> {
        this.mqttClient!.off('message', this.onMessage)
        await this.mqttClient!.end(true)
    }

    private onMessage = (_topic: string, message: Buffer): void => {
        const messageObject = JSON.parse(message.toString())
        this.receivedMessageObjects.push(messageObject)
        this.emit('messageObject', messageObject)
    }
}

describe('MQTT Bridge', () => {
    let stream: Stream
    let streamrClient: StreamrClient
    let broker: Broker
    let brokerUser: Wallet

    beforeAll(async () => {
        brokerUser = new Wallet(await fetchPrivateKeyWithGas(KEYSERVER_PORT))
        broker = await startBroker({
            privateKey: brokerUser.privateKey,
            extraPlugins: {
                mqtt: {
                    port: MQTT_PLUGIN_PORT
                }
            }
        })
    })

    afterAll(async () => {
        await Promise.allSettled([
            broker.stop()
        ])
    })

    beforeEach(async () => {
        streamrClient = createClient(brokerUser.privateKey)
        stream = await createTestStream(streamrClient, module)
    })

    afterEach(async () => {
        await streamrClient?.destroy()
    })

    test('message published by a MQTT client is delivered only once', async () => {
        const expected = {
            foo: Date.now()
        }

        const subscriber = new Subscriber()
        const promise = waitForEvent3<SubscriberEvents>(subscriber, 'messageObject', 20000)

        await subscriber.subscribe(stream.id)
        const publisher = await createMqttClient()

        publisher.publish(stream.id, JSON.stringify(expected))
        await promise

        expect(subscriber.receivedMessageObjects[0]).toEqual(expected)

        await Promise.allSettled([
            subscriber.stop(),
            publisher.end(true)
        ])
    })

    test('message published by a StreamrClient is delivered', async () => {
        const expected = {
            foo: Date.now()
        }
        
        const subscriber = new Subscriber()
        const promise = waitForEvent3<SubscriberEvents>(subscriber, 'messageObject', 20000)
        await subscriber.subscribe(stream.id)

        await streamrClient.publish(stream.id, expected)
        await promise
        
        expect(await subscriber.receivedMessageObjects[0]).toEqual(expected)

        await subscriber.stop()
    })

    test('message should be delivered once per client if subscribed by multiple clients', async () => {
        const expected = {
            foo: Date.now()
        }
        const subscriber1 = new Subscriber()
        const promise1 = waitForEvent3<SubscriberEvents>(subscriber1, 'messageObject', 20000)
        await subscriber1.subscribe(stream.id)
        
        const subscriber2 = new Subscriber()
        const promise2 = waitForEvent3<SubscriberEvents>(subscriber2, 'messageObject', 20000)
        await subscriber2.subscribe(stream.id)
        
        await streamrClient.publish(stream.id, expected)

        await Promise.all([promise1, promise2])

        expect(subscriber1.receivedMessageObjects[0]).toEqual(expected)
        expect(subscriber2.receivedMessageObjects[0]).toEqual(expected)

        await Promise.allSettled([
            subscriber1.stop(),
            subscriber2.stop()
        ])
    })

    it('subscription should not be unsubscribed if it was not subscribed by that client', async () => {
        const expected = {
            foo: Date.now()
        }
        
        const subscriber1 = new Subscriber()
        const promise1 = waitForEvent3<SubscriberEvents>(subscriber1, 'messageObject', 20000)
        await subscriber1.subscribe(stream.id)
        
        const subscriber2 = new Subscriber()
        await subscriber2.subscribe(stream.id)

        await subscriber2.unsubscribe(stream.id)
        
        await streamrClient.publish(stream.id, expected)

        await promise1
        expect(subscriber1.receivedMessageObjects[0]).toEqual(expected)

        await Promise.allSettled([
            subscriber1.stop(),
            subscriber2.stop()
        ])
    })

    test('message should be delivered to remaining subscribers if one subscriber unsubscribes', async () => {
        const expected = {
            foo: Date.now()
        }
        const subscriber1 = new Subscriber()
        const promise1 = waitForEvent3<SubscriberEvents>(subscriber1, 'messageObject', 20000)
        await subscriber1.subscribe(stream.id)
        
        const subscriber2 = new Subscriber()
        await subscriber2.subscribe(stream.id)
        
        await subscriber2.unsubscribe(stream.id)
        await streamrClient.publish(stream.id, expected)

        await promise1
        expect(subscriber1.receivedMessageObjects[0]).toEqual(expected)
        
        expect(subscriber2.receivedMessageObjects).toEqual([])

        await Promise.allSettled([
            subscriber1.stop(),
            subscriber2.stop()
        ])
    })
})
