const { startTracker } = require('streamr-network')
const { wait, waitForCondition } = require('streamr-test-utils')

const { startBroker, createClient, createMqttClient } = require('../utils')

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

describe('mqtt: end-to-end', () => {
    let tracker

    let broker1
    let broker2
    let broker3

    let client1
    let client2
    let client3

    let freshStream1

    let mqttClient1
    let mqttClient2
    let mqttClient3

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')

        broker1 = await startBroker('broker1', networkPort1, trackerPort, httpPort1, wsPort1, mqttPort1, true)
        broker2 = await startBroker('broker2', networkPort2, trackerPort, httpPort2, wsPort2, mqttPort2, true)
        broker3 = await startBroker('broker3', networkPort3, trackerPort, httpPort3, wsPort3, mqttPort3, true)

        client1 = createClient(wsPort1)
        client2 = createClient(wsPort2)
        client3 = createClient(wsPort3)

        mqttClient1 = createMqttClient(mqttPort1)
        mqttClient2 = createMqttClient(mqttPort2)
        mqttClient3 = createMqttClient(mqttPort3)

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

    it('test not valid api key', async (done) => {
        const mqttClient = createMqttClient(mqttPort1, 'localhost', 'NOT_VALID_KEY')
        mqttClient.on('error', (err) => {
            expect(err.message).toEqual('Connection refused: Bad username or password')
            mqttClient.end(true)
            done()
        })
    })

    it('test valid api key without permissions to stream', async (done) => {
        mqttClient1.on('error', (err) => {
            expect(err.message).toEqual('Connection refused: Not authorized')
            done()
        })

        mqttClient1.publish('NOT_VALID_STREAM', 'key: 1', {
            qos: 1
        })
    })

    it('happy-path: real-time mqtt plain text producing and consuming', async () => {
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []

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
        const client1Messages = []
        const client2Messages = []

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
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []
        const client4Messages = []

        await freshStream1.grantPermission('stream_get', 'tester2@streamr.com')
        await freshStream1.grantPermission('stream_subscribe', 'tester2@streamr.com')

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

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 1)

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
