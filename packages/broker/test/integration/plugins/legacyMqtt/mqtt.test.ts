import { AsyncMqttClient } from 'async-mqtt'
import StreamrClient, { Stream } from 'streamr-client'
import { startTracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Todo } from '../../../../src/types'
import { Broker } from '../../../broker'
import { startBroker, fastPrivateKey, createClient, createMqttClient, createTestStream } from '../../../utils'

const httpPort1 = 12381
const httpPort2 = 12382
const httpPort3 = 12383
const wsPort1 = 12391
const wsPort2 = 12392
const wsPort3 = 12393
const trackerPort = 12410
const mqttPort1 = 12551
const mqttPort2 = 12552
const mqttPort3 = 12553
const broker1Key = '0x0d4f33e0e76e9f7c26178db90319617a798819acd51004693f65bd9b86444e4b'
const broker2Key = '0xd2672dce1578d6b75a58e11fa96c978b3b500750be287fc4e7f1e894eb179da7'
const broker3Key = '0xa417da20e3afeb69544585c6b44b95ad4d987f38cf257f4a53eab415cc12334f'

describe('mqtt: end-to-end', () => {
    let tracker: Todo
    let broker1: Broker
    let broker2: Broker
    let broker3: Broker
    const privateKey = fastPrivateKey()
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
            id: 'tracker-1'
        })
        broker1 = await startBroker({
            name: 'broker1',
            privateKey: broker1Key,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            legacyMqttPort: mqttPort1
        })
        broker2 = await startBroker({
            name: 'broker2',
            privateKey: broker2Key,
            trackerPort,
            httpPort: httpPort2,
            wsPort: wsPort2,
            legacyMqttPort: mqttPort2
        })
        broker3 = await startBroker({
            name: 'broker3',
            privateKey: broker3Key,
            trackerPort,
            httpPort: httpPort3,
            wsPort: wsPort3,
            legacyMqttPort: mqttPort3
        })
    }, 15000)

    beforeEach(async () => {
        client1 = createClient(wsPort1, privateKey)
        client2 = createClient(wsPort2, privateKey)
        client3 = createClient(wsPort3, privateKey)

        mqttClient1 = createMqttClient(mqttPort1, 'localhost', privateKey)
        mqttClient2 = createMqttClient(mqttPort2, 'localhost', privateKey)
        mqttClient3 = createMqttClient(mqttPort3, 'localhost', privateKey)

        freshStream1 = await createTestStream(client1, module)
    }, 15000)

    afterEach(async () => {
        await tracker.stop()

        await Promise.all([
            client1.ensureDisconnected(),
            client2.ensureDisconnected(),
            client3.ensureDisconnected(),
        ])

        await Promise.all([
            mqttClient1.end(true),
            mqttClient2.end(true),
            mqttClient3.end(true),
        ])

        await Promise.all([
            broker1.stop(),
            broker2.stop(),
            broker3.stop(),
        ])
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

        mqttClient1.on('message', (_topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (_topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        mqttClient3.on('message', (_topic, message) => {
            client3Messages.push(JSON.parse(message.toString()))
        })

        mqttClient1.publish(freshStream1.id, 'key: 1', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)
        await waitForCondition(() => client3Messages.length === 1)

        await mqttClient2.publish(freshStream1.id, 'key: 2', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2)
        await waitForCondition(() => client2Messages.length === 2)
        await waitForCondition(() => client3Messages.length === 2)

        await mqttClient3.publish(freshStream1.id, 'key: 3', {
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

        mqttClient1.on('message', (_topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (_topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        mqttClient1.publish(freshStream1.id, JSON.stringify({
            key: 1
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)

        await mqttClient2.publish(freshStream1.id, JSON.stringify({
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
        mqttClient1.on('message', (_topic, message) => {
            client4Messages.push(JSON.parse(message.toString()))
        })

        await Promise.all([
            client1.subscribe({
                stream: freshStream1.id
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStream1.id
            }, (message) => {
                client2Messages.push(message)
            }),
            client3.subscribe({
                stream: freshStream1.id
            }, (message) => {
                client3Messages.push(message)
            })
        ])

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
        await mqttClient1.publish(freshStream1.id, JSON.stringify({
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
