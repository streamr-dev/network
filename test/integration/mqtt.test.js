const { startTracker } = require('@streamr/streamr-p2p-network')
const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')

const createBroker = require('../../src/broker')

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

// Copy-paste from network, should maybe consider packaging into library?
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitForCondition = (conditionFn, timeout = 10 * 1000, retryInterval = 100) => {
    if (conditionFn()) {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const refs = {}

        refs.timeOut = setTimeout(() => {
            clearInterval(refs.interval)
            reject(new Error('waitForCondition: timed out before condition became true'))
        }, timeout)

        refs.interval = setInterval(() => {
            if (conditionFn()) {
                clearTimeout(refs.timeOut)
                clearInterval(refs.interval)
                resolve()
            }
        }, retryInterval)
    })
}

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

describe('mqtt: end-to-end', () => {
    let tracker

    let broker1
    let broker2
    let broker3

    let client1
    let client2
    let client3

    let freshStream1
    let freshStreamId1
    let freshStreamName1

    let freshStream2
    let freshStreamId2
    let freshStreamName2

    let mqttClient1
    let mqttClient2

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')

        broker1 = await startBroker('broker1', httpPort1, wsPort1, networkPort1, mqttPort1, true)
        broker2 = await startBroker('broker2', httpPort2, wsPort2, networkPort2, mqttPort2, true)
        broker3 = await startBroker('broker3', httpPort3, wsPort3, networkPort3, mqttPort3, true)

        client1 = createClient(wsPort1, 'tester1-api-key')
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        client2 = createClient(wsPort2, 'tester1-api-key')
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        client3 = createClient(wsPort3, 'tester2-api-key') // different api key
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E

        mqttClient1 = createMqttClient(mqttPort1)
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        mqttClient2 = createMqttClient(mqttPort2)
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E

        freshStream1 = await client1.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId1 = freshStream1.id
        freshStreamName1 = freshStream1.name

        freshStream2 = await client2.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId2 = freshStream2.id
        freshStreamName2 = freshStream2.name
    })

    afterEach(async () => {
        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
        await client3.ensureDisconnected()

        mqttClient1.end()
        mqttClient2.end()

        broker1.close()
        broker2.close()
        broker3.close()

        tracker.stop()
    })

    it('test not valid api key', async (done) => {
        const mqttClient = createMqttClient(mqttPort1, 'localhost', 'NOT_VALID_KEY')
        mqttClient.on('error', (err) => {
            expect(err.message).toEqual('Connection refused: Bad username or password')
            done()
        })
    })

    it('test valid api key without permissions to stream', async (done) => {
        mqttClient1.on('error', (err) => {
            expect(err.message).toEqual('Connection refused: Not authorized')
            done()
        })

        await mqttClient1.publish('NOT_VALID_STREARM', 'key: 1', {
            qos: 1
        })
    })

    it('happy-path: real-time mqtt plain text producing and consuming', async () => {
        const client1Messages = []
        const client2Messages = []

        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        mqttClient1.subscribe(freshStreamName1)
        mqttClient2.subscribe(freshStreamName1)

        await wait(100)

        mqttClient1.on('message', (topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        await mqttClient1.publish(freshStreamName1, 'key: 1', {
            qos: 1
        })

        await wait(500)

        await mqttClient2.publish(freshStreamName1, 'key: 2', {
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
    })

    it('happy-path: real-time mqtt json producing and consuming', async () => {
        const client1Messages = []
        const client2Messages = []

        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        mqttClient1.subscribe(freshStreamName1)
        mqttClient2.subscribe(freshStreamName1)

        mqttClient1.on('message', (topic, message) => {
            client1Messages.push(JSON.parse(message.toString()))
        })

        mqttClient2.on('message', (topic, message) => {
            client2Messages.push(JSON.parse(message.toString()))
        })

        await mqttClient1.publish(freshStreamName1, JSON.stringify({
            key: 1
        }), {
            qos: 1
        })

        await wait(1000)

        await mqttClient2.publish(freshStreamName1, JSON.stringify({
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
    })

    it('happy-path: real-time mqtt and websocket producing and consuming', async () => {
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []
        const client4Messages = []

        await freshStream1.grantPermission('read', 'tester2@streamr.com')

        await waitForCondition(() => mqttClient1.connected)

        mqttClient1.subscribe(freshStreamName1)
        mqttClient1.on('message', (topic, message) => {
            client4Messages.push(JSON.parse(message.toString()))
        })

        client1.subscribe({
            stream: freshStreamId1
        }, (message, metadata) => {
            client1Messages.push(message)
        })

        client2.subscribe({
            stream: freshStreamId1
        }, (message, metadata) => {
            client2Messages.push(message)
        })

        client3.subscribe({
            stream: freshStreamId1
        }, (message, metadata) => {
            client3Messages.push(message)
        })

        await wait(2000) // TODO: seems like this is needed for subscribes to go thru?
        await client1.publish(freshStreamId1, {
            key: 1
        })
        await client1.publish(freshStreamId1, {
            key: 2
        })
        await client1.publish(freshStreamId1, {
            key: 3
        })

        await wait(100)
        await mqttClient1.publish(freshStreamName1, JSON.stringify({
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
    })

    it('mqtt clients subscribe and unsubscribe logic', async () => {
        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStreamName1)
        await mqttClient2.subscribe(freshStreamName1)

        // for mqtt partition is always zero
        expect(broker1.getStreams()).toEqual([freshStreamId1 + '::0'])
        await mqttClient1.unsubscribe(freshStreamName1)

        await wait(200)

        expect(broker1.getStreams()).toEqual([])
        expect(broker2.getStreams()).toEqual([freshStreamId1 + '::0'])
    })
})
