import { AsyncMqttClient } from 'async-mqtt'
import StreamrClient, { Stream } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'

import { Broker } from '../../src/broker'
import { startBroker, fastPrivateKey, createClient, createMqttClient, createTestStream, getSPIDKeys } from '../utils'

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
    const privateKey = fastPrivateKey()
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream1: Stream
    let freshStream2: Stream
    let mqttClient1: AsyncMqttClient
    let mqttClient2: AsyncMqttClient

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: trackerPort
            },
            id: 'tracker'
        })

        broker1 = await startBroker({
            name: 'broker1',
            privateKey: '0xd622f9e4dbcd8b98f12604f0af8ac1cbc75004829e505fdd0ed04f456ef52828',
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            legacyMqttPort: mqttPort1
        })
        broker2 = await startBroker({
            name: 'broker2',
            privateKey: '0xbaa8e6137a9474ecb6694ad3e4f1743732e38c36e9bdda628e651d36ed732241',
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
    }, 10 * 1000)

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

        await waitForCondition(() => getSPIDKeys(broker1).length === 1)
        await waitForCondition(() => getSPIDKeys(broker2).length === 1)

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream1.id + '#0'])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream2.id + '#0'])

        await mqttClient1.subscribe(freshStream2.id)
        await mqttClient2.subscribe(freshStream1.id)

        await waitForCondition(() => getSPIDKeys(broker1).length === 2)
        await waitForCondition(() => getSPIDKeys(broker2).length === 2)

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'].sort())
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'].sort())

        // client boots own node, so broker streams should not change
        await client1.subscribe(freshStream1, () => {})
        // subscribing twice should do nothing to count
        await mqttClient1.subscribe(freshStream2.id)

        await wait(500) // give some time for client1 to subscribe.

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'].sort())
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'].sort())

        await mqttClient1.unsubscribe(freshStream1.id)

        await waitForCondition(() => getSPIDKeys(broker1).length === 1)
        await waitForCondition(() => getSPIDKeys(broker2).length === 2)

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream2.id + '#0'])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'].sort())

        await mqttClient1.unsubscribe(freshStream2.id)

        await waitForCondition(() => getSPIDKeys(broker1).length === 0)
        await waitForCondition(() => getSPIDKeys(broker2).length === 2)

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'].sort())
    }, 10000)
})
