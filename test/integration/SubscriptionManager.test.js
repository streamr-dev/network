const { startTracker } = require('@streamr/streamr-p2p-network')
const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')
const { wait, waitForCondition } = require('streamr-test-utils')

const createBroker = require('../../src/broker')

const httpPort1 = 13381
const httpPort2 = 13382
const wsPort1 = 13391
const wsPort2 = 13392
const networkPort1 = 13401
const networkPort2 = 13402
const trackerPort = 13410
const mqttPort1 = 13551
const mqttPort2 = 13552

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
            hosts: 'localhost',
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

describe('SubscriptionManager', () => {
    let tracker

    let broker1
    let broker2

    let client1
    let client2

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

        await wait(2000)

        client1 = createClient(wsPort1, 'tester1-api-key')
        await wait(100)
        client2 = createClient(wsPort2, 'tester1-api-key')
        await wait(100)

        mqttClient1 = createMqttClient(mqttPort1)
        await wait(100)
        mqttClient2 = createMqttClient(mqttPort2)
        await wait(100)

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
    }, 10 * 1000)

    afterEach(async () => {
        tracker.stop(() => {})

        await client1.ensureDisconnected()
        await client2.ensureDisconnected()

        mqttClient1.end(true)
        mqttClient2.end(true)

        broker1.close()
        broker2.close()

        await wait(1000)
    })

    it('SubscriptionManager correctly handles subscribe/unsubscribe requests across all adapters', async () => {
        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStreamName1)
        await mqttClient2.subscribe(freshStreamName2)

        await wait(1000)

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 1)

        expect(broker1.getStreams()).toEqual([freshStreamId1 + '::0'])
        expect(broker2.getStreams()).toEqual([freshStreamId2 + '::0'])

        await client1.subscribe({
            stream: freshStreamId2
        }, () => {})

        await client2.subscribe({
            stream: freshStreamId1
        }, () => {})

        await waitForCondition(() => broker1.getStreams().length === 2)
        await waitForCondition(() => broker2.getStreams().length === 2)

        await wait(1000)

        expect(broker1.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())

        await client1.subscribe({
            stream: freshStreamId1
        }, () => {})

        await wait(1000)
        expect(broker1.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())

        await mqttClient1.unsubscribe(freshStreamName1)
        expect(broker1.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())

        await client1.unsubscribeAll(freshStreamId1)

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([freshStreamId2 + '::0'])
        expect(broker2.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())

        await wait(1000)
        await client1.unsubscribeAll(freshStreamId2)

        await waitForCondition(() => broker1.getStreams().length === 0)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([])
        expect(broker2.getStreams()).toEqual([freshStreamId1 + '::0', freshStreamId2 + '::0'].sort())
    }, 10000)
})
