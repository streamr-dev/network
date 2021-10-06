import { AsyncMqttClient } from 'async-mqtt'
import StreamrClient, { Stream } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Broker } from '../broker'
import { startBroker, createClient, createMqttClient, createTestStream } from '../utils'

jest.setTimeout(30000)

const httpPort1 = 13381
const httpPort2 = 13382
const wsPort1 = 13391
const wsPort2 = 13392
const trackerPort = 13410
const mqttPort1 = 13551
const mqttPort2 = 13552

describe('SubscriptionManager', () => {
    let tracker: Tracker
    let broker1: Broker
    let broker2: Broker
    const privateKey = '0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0'
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream1: Stream
    let freshStream2: Stream
    let mqttClient1: AsyncMqttClient
    let mqttClient2: AsyncMqttClient

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        broker1 = await startBroker({
            name: 'broker1',
            privateKey: '0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae',
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            legacyMqttPort: mqttPort1
        })
        broker2 = await startBroker({
            name: 'broker2',
            privateKey: '0x633a182fb8975f22aaad41e9008cb49a432e9fdfef37f151e9e7c54e96258ef9',
            trackerPort,
            httpPort: httpPort2,
            wsPort: wsPort2,
            legacyMqttPort: mqttPort2
        })

        await wait(2000)

        client1 = createClient(tracker, privateKey)
        client2 = createClient(tracker, privateKey)

        mqttClient1 = createMqttClient(mqttPort1, 'localhost', privateKey)
        mqttClient2 = createMqttClient(mqttPort2, 'localhost', privateKey)

        freshStream1 = await createTestStream(client1, module)
        freshStream2 = await createTestStream(client2, module)
    })

    afterEach(async () => {
        await mqttClient1.end(true)
        await mqttClient2.end(true)
        await client1.destroy()
        await client2.destroy()
        await broker1.stop()
        await broker2.stop()
        await tracker.stop()
    })

    it('SubscriptionManager correctly handles subscribe/unsubscribe requests across all plugins', async () => {
        await waitForCondition(() => mqttClient1.connected)
        await waitForCondition(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStream1.id)
        await mqttClient2.subscribe(freshStream2.id)

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 1)

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0'])
        expect(broker2.getStreams()).toEqual([freshStream2.id + '::0'])

        await mqttClient1.subscribe(freshStream2.id)
        await mqttClient2.subscribe(freshStream1.id)

        await waitForCondition(() => broker1.getStreams().length === 2)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        // client boots own node, so broker streams should not change
        await client1.subscribe(freshStream1, () => {})
        // subscribing twice should do nothing to count
        await mqttClient1.subscribe(freshStream2.id)

        await wait(500) // give some time for client1 to subscribe.

        expect(broker1.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        await mqttClient1.unsubscribe(freshStream1.id)

        await waitForCondition(() => broker1.getStreams().length === 1)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([freshStream2.id + '::0'])
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())

        await mqttClient1.unsubscribe(freshStream2.id)

        await waitForCondition(() => broker1.getStreams().length === 0)
        await waitForCondition(() => broker2.getStreams().length === 2)

        expect(broker1.getStreams()).toEqual([])
        expect(broker2.getStreams()).toEqual([freshStream1.id + '::0', freshStream2.id + '::0'].sort())
    })
})
