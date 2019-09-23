const { startTracker } = require('@streamr/streamr-p2p-network')
const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')
const { wait, waitForCondition } = require('streamr-test-utils')

const createBroker = require('../../src/broker')

const trackerPort = 17711
const httpPort1 = 17712
const wsPort1 = 17713
const networkPort1 = 17701
const mqttPort1 = 17751

function startBroker(id, httpPort, wsPort, networkPort, mqttPort, enableCassandra) {
    return createBroker({
        network: {
            id,
            hostname: '127.0.0.1',
            port: networkPort,
            advertisedWsUrl: null,
            tracker: `ws://127.0.0.1:${trackerPort}`,
            isStorageNode: false
        },
        cassandra: enableCassandra ? {
            hosts: [
                'localhost',
            ],
            username: '',
            password: '',
            keyspace: 'streamr_dev',
        } : false,
        reporting: false,
        streamrUrl: 'http://localhost:8081/streamr-core',
        adapters: [
            {
                name: 'ws',
                port: wsPort,
            },
            {
                name: 'http',
                port: httpPort,
            },
            {
                name: 'mqtt',
                port: mqttPort,
                streamsTimeout: 300000
            }
        ],
    })
}

function createClient(wsPort, apiKey) {
    return new StreamrClient({
        url: `ws://localhost:${wsPort}/api/v1/ws`,
        restUrl: 'http://localhost:8081/streamr-core/api/v1',
        auth: {
            apiKey
        }
    })
}

function createMqttClient(mqttPort = 9000, host = 'localhost', apiKey = 'tester1-api-key') {
    return mqtt.connect({
        hostname: host,
        port: mqttPort,
        username: '',
        password: apiKey
    })
}

describe('local propagation', () => {
    let tracker
    let broker

    let client1
    let client2

    let freshStream
    let freshStreamId
    let freshStreamName

    let mqttClient1
    let mqttClient2

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')

        broker = await startBroker('broker1', httpPort1, wsPort1, networkPort1, mqttPort1, true)

        client1 = createClient(wsPort1, 'tester1-api-key')
        await wait(100)
        client2 = createClient(wsPort1, 'tester1-api-key')
        await wait(100)

        mqttClient1 = createMqttClient(mqttPort1)
        await wait(100)
        mqttClient2 = createMqttClient(mqttPort1)
        await wait(100)

        freshStream = await client1.createStream({
            name: 'local-propagation.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id
        freshStreamName = freshStream.name

        await wait(3000)
    }, 10 * 1000)

    afterEach(async () => {
        tracker.stop(() => {})

        await client1.ensureDisconnected()
        await client2.ensureDisconnected()

        mqttClient1.end(true)
        mqttClient2.end(true)

        broker.close()

        await wait(1000)
    })

    test('local propagation using StreamrClients', async () => {
        const client1Messages = []
        const client2Messages = []

        client1.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client1Messages.push(message)
        })

        client2.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client2Messages.push(message)
        })

        await wait(1000)

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
        const client1Messages = []
        const client2Messages = []

        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        mqttClient1.subscribe(freshStreamName)
        mqttClient2.subscribe(freshStreamName)

        await wait(100)

        mqttClient1.on('message', (topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        await mqttClient1.publish(freshStreamName, 'key: 1', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)

        await mqttClient2.publish(freshStreamName, 'key: 2', {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2)
        await waitForCondition(() => client2Messages.length === 2)

        expect(client1Messages).toEqual([
            {
                mqttPayload: 'key: 1'
            },
            {
                mqttPayload: 'key: 2'
            }
        ])

        expect(client2Messages).toEqual([
            {
                mqttPayload: 'key: 1'
            },
            {
                mqttPayload: 'key: 2'
            }
        ])
    }, 10000)

    test('local propagation using StreamrClients and mqtt clients', async () => {
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []
        const client4Messages = []

        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        mqttClient1.subscribe(freshStreamName)
        mqttClient2.subscribe(freshStreamName)

        mqttClient1.on('message', (topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        client1.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client3Messages.push(message)
        })

        client2.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client4Messages.push(message)
        })

        await wait(1000)

        await mqttClient1.publish(freshStreamName, JSON.stringify({
            key: 1
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 1)
        await waitForCondition(() => client2Messages.length === 1)
        await waitForCondition(() => client3Messages.length === 1)
        await waitForCondition(() => client4Messages.length === 1)

        await mqttClient2.publish(freshStreamName, JSON.stringify({
            key: 2
        }), {
            qos: 1
        })

        await waitForCondition(() => client1Messages.length === 2)
        await waitForCondition(() => client2Messages.length === 2)
        await waitForCondition(() => client3Messages.length === 2)
        await waitForCondition(() => client4Messages.length === 2)

        await client1.publish(freshStreamId, {
            key: 3
        })

        await wait(500)

        await client2.publish(freshStreamId, {
            key: 4
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
    }, 10000)
})
