import { Wallet } from '@ethersproject/wallet'
import { AsyncMqttClient } from 'async-mqtt'
import StreamrClient, { Stream, StreamOperation } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Broker } from '../broker'
import { startBroker, createClient, createMqttClient, createTestStream, getPrivateKey } from '../utils'

jest.setTimeout(30000)

const trackerPort = 17711
const httpPort = 17712
const wsPort = 17713
const mqttPort = 17751

describe('local propagation', () => {
    let tracker: Tracker
    let broker: Broker
    let privateKey: string
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream: Stream
    let freshStreamId: string
    let mqttClient1: AsyncMqttClient
    let mqttClient2: AsyncMqttClient
    let brokerWallet: Wallet

    beforeAll(async () => {
        privateKey = await getPrivateKey()
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: trackerPort
            },
            id: 'tracker-1'
        })
        brokerWallet = new Wallet(await getPrivateKey())

        broker = await startBroker({
            name: 'broker1',
            privateKey: brokerWallet.privateKey,
            trackerPort,
            httpPort,
            wsPort,
            mqttPort: mqttPort
        })

        client1 = await createClient(tracker, privateKey)
        client2 = await createClient(tracker, privateKey)

        mqttClient1 = createMqttClient(mqttPort, 'localhost', privateKey)
        mqttClient2 = createMqttClient(mqttPort, 'localhost', privateKey)
    })

    beforeEach(async () => {
        freshStream = await createTestStream(client1, module)
        freshStreamId = freshStream.id
        await freshStream.grantUserPermission(StreamOperation.STREAM_PUBLISH, brokerWallet.address)

        await wait(3000)
    })

    afterAll(async () => {
        await Promise.all([
            tracker.stop(),
            client1.destroy(),
            client2.destroy(),
            mqttClient2.end(true),
            mqttClient1.end(true),
            broker.stop()
        ])
    })

    test('local propagation using StreamrClients', async () => {
        const client1Messages: any[] = []
        const client2Messages: any[] = []

        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStreamId
            }, (message) => {
                client2Messages.push(message)
            })
        ])

        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })

        await waitForCondition(() => client2Messages.length === 3)
        await waitForCondition(() => client1Messages.length === 3)

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
        ])
    })

    test('local propagation using mqtt clients', async () => {
        const client1Messages: any[] = []
        const client2Messages: any[] = []

        await waitForCondition(() => mqttClient1.connected, 10000)
        await waitForCondition(() => mqttClient2.connected, 10000)

        mqttClient1.on('message', (_topic, message) => {
            client1Messages.push(message.toString())
        })

        mqttClient2.on('message', (_topic, message) => {
            client2Messages.push(message.toString())
        })

        await mqttClient1.subscribe(freshStreamId)
        await mqttClient2.subscribe(freshStreamId)

        await mqttClient1.publish(freshStreamId, 'key: 1', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)

        await mqttClient2.publish(freshStreamId, 'key: 2', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2)
        await waitForCondition(() => client2Messages.length === 2)

        expect(client1Messages).toEqual(['key: 1', 'key: 2'])

        expect(client2Messages).toEqual(['key: 1', 'key: 2'])
    })

    test('local propagation using StreamrClients and mqtt clients', async () => {
        const client1Messages: any[] = []
        const client2Messages: any[] = []
        const client3Messages: any[] = []
        const client4Messages: any[] = []

        await waitForCondition(() => mqttClient1.connected, 10000)
        await waitForCondition(() => mqttClient2.connected, 10000)

        mqttClient1.on('message', (_topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (_topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        await mqttClient1.subscribe(freshStreamId)
        await mqttClient2.subscribe(freshStreamId)

        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, (message) => {
                client3Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStreamId
            }, (message) => {
                client4Messages.push(message)
            })
        ])

        await mqttClient1.publish(freshStreamId, JSON.stringify({
            key: 1
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1, 100000)
        await waitForCondition(() => client2Messages.length === 1, 100000)
        await waitForCondition(() => client3Messages.length === 1, 100000)
        await waitForCondition(() => client4Messages.length === 1, 100000)

        await mqttClient2.publish(freshStreamId, JSON.stringify({
            key: 2
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2, 100000)
        await waitForCondition(() => client2Messages.length === 2, 100000)
        await waitForCondition(() => client3Messages.length === 2, 100000)
        await waitForCondition(() => client4Messages.length === 2, 100000)

        await client1.publish(freshStreamId, {
            key: 3
        })

        await wait(500)

        await client2.publish(freshStreamId, {
            key: 4
        })

        await waitForCondition(() => client1Messages.length === 4, 10000)
        await waitForCondition(() => client2Messages.length === 4, 10000)
        await waitForCondition(() => client3Messages.length === 4, 10000)
        await waitForCondition(() => client4Messages.length === 4, 10000)

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
    })
})
