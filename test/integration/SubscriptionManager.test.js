const { startTracker } = require('streamr-network')
const { wait, waitForCondition } = require('streamr-test-utils')

const { startBroker, createMockUser, createClient, createMqttClient } = require('../utils')

const httpPort1 = 13381
const httpPort2 = 13382
const wsPort1 = 13391
const wsPort2 = 13392
const networkPort1 = 13401
const networkPort2 = 13402
const trackerPort = 13410
const mqttPort1 = 13551
const mqttPort2 = 13552

describe('SubscriptionManager', () => {
    let tracker

    let broker1
    let broker2

    const mockUser = createMockUser()

    let client1
    let client2

    let freshStream1
    let freshStream2

    let mqttClient1
    let mqttClient2

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        broker1 = await startBroker({
            name: 'broker1',
            privateKey: '0xd622f9e4dbcd8b98f12604f0af8ac1cbc75004829e505fdd0ed04f456ef52828',
            networkPort: networkPort1,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            mqttPort: mqttPort1
        })
        broker2 = await startBroker({
            name: 'broker2',
            privateKey: '0xbaa8e6137a9474ecb6694ad3e4f1743732e38c36e9bdda628e651d36ed732241',
            networkPort: networkPort2,
            trackerPort,
            httpPort: httpPort2,
            wsPort: wsPort2,
            mqttPort: mqttPort2
        })

        await wait(2000)

        client1 = createClient(wsPort1, mockUser.privateKey)
        client2 = createClient(wsPort2, mockUser.privateKey)

        mqttClient1 = createMqttClient(mqttPort1, 'localhost', mockUser.privateKey)
        mqttClient2 = createMqttClient(mqttPort2, 'localhost', mockUser.privateKey)

        freshStream1 = await client1.createStream({
            name: 'SubscriptionManager.test.js-' + Date.now()
        })
        freshStream2 = await client2.createStream({
            name: 'SubscriptionManager.test.js-' + Date.now()
        })
    }, 10 * 1000)

    afterEach(async () => {
        await mqttClient1.end(true)
        await mqttClient2.end(true)
        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
        await broker1.close()
        await broker2.close()
        await tracker.stop()
    })

    it('SubscriptionManager correctly handles subscribe/unsubscribe requests across all adapters', async () => {
        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStream1.id)
        await mqttClient2.subscribe(freshStream2.id)

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 1)

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0'])
        expect(broker2.getStreams()).toEqual([freshStream2.id + '::0'])

        await client1.subscribe({
            stream: freshStream2.id
        }, () => {})

        await client2.subscribe({
            stream: freshStream1.id
        }, () => {})

        await waitForCondition(() => broker1.getStreams().length === 2)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        await client1.subscribe({
            stream: freshStream1.id
        }, () => {})

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        await mqttClient1.unsubscribe(freshStream1.id)

        await waitForCondition(() => broker1.getStreams().length === 2)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        await client1.unsubscribe(freshStream1.id)

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([freshStream2.id + '::0'])
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        await client1.unsubscribe(freshStream2.id)

        await waitForCondition(() => broker1.getStreams().length === 0)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([])
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
    }, 10000)
})
