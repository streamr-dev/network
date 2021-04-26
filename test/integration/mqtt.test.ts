import { AsyncMqttClient } from 'async-mqtt'
import StreamrClient, { Stream } from 'streamr-client'
import { startTracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Todo } from '../types'
import { startBroker, createMockUser, createClient, createMqttClient } from '../utils'

const httpPort1 = 12381
const httpPort2 = 12382
const httpPort3 = 12383
const wsPort1 = 12391
const wsPort2 = 12392
const wsPort3 = 12393
const networkPort1 = 12401
const networkPort2 = 12402
const networkPort3 = 12403
const trackerPort = 12410
const mqttPort1 = 12551
const mqttPort2 = 12552
const mqttPort3 = 12553
const broker1Key = '0x0d4f33e0e76e9f7c26178db90319617a798819acd51004693f65bd9b86444e4b'
const broker2Key = '0xd2672dce1578d6b75a58e11fa96c978b3b500750be287fc4e7f1e894eb179da7'
const broker3Key = '0xa417da20e3afeb69544585c6b44b95ad4d987f38cf257f4a53eab415cc12334f'

describe('mqtt: end-to-end', () => {
    let tracker: Todo
    let broker1: Todo
    let broker2: Todo
    let broker3: Todo
    const mockUser = createMockUser()
    let client1: StreamrClient
    let client2: StreamrClient
    let client3: StreamrClient
    let freshStream1: Stream
    let mqttClient1: AsyncMqttClient
    let mqttClient2: AsyncMqttClient
    let mqttClient3: AsyncMqttClient

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        broker1 = await startBroker({
            name: 'broker1',
            privateKey: broker1Key,
            networkPort: networkPort1,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            mqttPort: mqttPort1
        })
        broker2 = await startBroker({
            name: 'broker2',
            privateKey: broker2Key,
            networkPort: networkPort2,
            trackerPort,
            httpPort: httpPort2,
            wsPort: wsPort2,
            mqttPort: mqttPort2
        })
        broker3 = await startBroker({
            name: 'broker3',
            privateKey: broker3Key,
            networkPort: networkPort3,
            trackerPort,
            httpPort: httpPort3,
            wsPort: wsPort3,
            mqttPort: mqttPort3
        })

        client1 = createClient(wsPort1, mockUser.privateKey)
        client2 = createClient(wsPort2, mockUser.privateKey)
        client3 = createClient(wsPort3, mockUser.privateKey)

        mqttClient1 = createMqttClient(mqttPort1, 'localhost', mockUser.privateKey)
        mqttClient2 = createMqttClient(mqttPort2, 'localhost', mockUser.privateKey)
        mqttClient3 = createMqttClient(mqttPort3, 'localhost', mockUser.privateKey)

        freshStream1 = await client1.createStream({
            name: 'mqtt.test.js-' + Date.now()
        })
    }, 15000)

    afterEach(async () => {
        await tracker.stop()

        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
        await client3.ensureDisconnected()

        await mqttClient1.end(true)
        await mqttClient2.end(true)
        await mqttClient3.end(true)

        await broker1.close()
        await broker2.close()
        await broker3.close()
    }, 15000)

    it('happy-path: real-time mqtt plain text producing and consuming', async () => {
        const client1Messages: Todo[] = []
        const client2Messages: Todo[] = []
        const client3Messages: Todo[] = []

        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)
        await waitForCondition(() => mqttClient3.connected)

        await mqttClient1.subscribe(freshStream1.id)
        await mqttClient2.subscribe(freshStream1.id)
        await mqttClient3.subscribe(freshStream1.id)

        mqttClient1.on('message', (topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        mqttClient3.on('message', (topic, message) => {
            client3Messages.push(JSON.parse(message.toString()))
        })

        mqttClient1.publish(freshStream1.id, 'key: 1', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)
        await waitForCondition(() => client3Messages.length === 1)

        mqttClient2.publish(freshStream1.id, 'key: 2', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2)
        await waitForCondition(() => client2Messages.length === 2)
        await waitForCondition(() => client3Messages.length === 2)

        mqttClient3.publish(freshStream1.id, 'key: 3', {
            qos: 0
        })

        await waitForCondition(() => client1Messages.length === 3)
        await waitForCondition(() => client2Messages.length === 3)
        await waitForCondition(() => client3Messages.length === 3)

        expect(client1Messages).toEqual([
            {
                mqttPayload: 'key: 1'
            },
            {
                mqttPayload: 'key: 2'
            },
            {
                mqttPayload: 'key: 3'
            }
        ])

        expect(client2Messages).toEqual([
            {
                mqttPayload: 'key: 1'
            },
            {
                mqttPayload: 'key: 2'
            },
            {
                mqttPayload: 'key: 3'
            }
        ])

        expect(client3Messages).toEqual([
            {
                mqttPayload: 'key: 1'
            },
            {
                mqttPayload: 'key: 2'
            },
            {
                mqttPayload: 'key: 3'
            }
        ])
    }, 15000)

    it('happy-path: real-time mqtt json producing and consuming', async () => {
        const client1Messages: Todo[] = []
        const client2Messages: Todo[] = []

        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStream1.id)
        await mqttClient2.subscribe(freshStream1.id)

        mqttClient1.on('message', (topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        mqttClient1.publish(freshStream1.id, JSON.stringify({
            key: 1
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)

        mqttClient2.publish(freshStream1.id, JSON.stringify({
            key: 2
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2)
        await waitForCondition(() => client2Messages.length === 2)

        expect(client1Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            }
        ])

        expect(client2Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            }
        ])
    }, 15000)

    it('happy-path: real-time mqtt and websocket producing and consuming', async () => {
        const client1Messages: Todo[] = []
        const client2Messages: Todo[] = []
        const client3Messages: Todo[] = []
        const client4Messages: Todo[] = []

        await waitForCondition(() => mqttClient1.connected)

        await mqttClient1.subscribe(freshStream1.id)
        mqttClient1.on('message', (topic, message) => {
            client4Messages.push(JSON.parse(message.toString()))
        })

        client1.subscribe({
            stream: freshStream1.id
        }, (message, metadata) => {
            client1Messages.push(message)
        })

        client2.subscribe({
            stream: freshStream1.id
        }, (message, metadata) => {
            client2Messages.push(message)
        })

        client3.subscribe({
            stream: freshStream1.id
        }, (message, metadata) => {
            client3Messages.push(message)
        })

        await wait(2000) // TODO: seems like this is needed for subscribes to go thru?
        await client1.publish(freshStream1.id, {
            key: 1
        })
        await client1.publish(freshStream1.id, {
            key: 2
        })
        await client1.publish(freshStream1.id, {
            key: 3
        })

        await wait(100)
        mqttClient1.publish(freshStream1.id, JSON.stringify({
            key: 4
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 4)
        await waitForCondition(() => client2Messages.length === 4)
        await waitForCondition(() => client3Messages.length === 4)
        await waitForCondition(() => client4Messages.length === 4)

        expect(client1Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client3Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client4Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])
    }, 15000)

    it('mqtt clients subscribe and unsubscribe logic', async () => {
        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStream1.id)
        await mqttClient2.subscribe(freshStream1.id)

        await waitForCondition(() => broker1.getNeighbors().length === 1)
        await waitForCondition(() => broker2.getNeighbors().length === 1)

        // for mqtt partition is always zero
        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0'])
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0'])
        await mqttClient1.unsubscribe(freshStream1.id)

        await waitForCondition(() => broker1.getStreams().length === 0)
        await waitForCondition(() => broker2.getStreams().length === 1)

        expect(broker1.getStreams()).toEqual([])
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0'])
    }, 10000)
})
