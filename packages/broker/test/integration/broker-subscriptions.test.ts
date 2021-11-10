import { Wallet } from '@ethersproject/wallet'
import mqtt, { AsyncMqttClient } from 'async-mqtt'
import StreamrClient, { Stream, StreamOperation } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Broker } from '../broker'
import { startBroker, fastPrivateKey, createClient, createTestStream, getSPIDKeys, createMockUser } from '../utils'

const wsPort1 = 13391
const wsPort2 = 13392
const trackerPort = 13410
const mqttPort1 = 13551
const mqttPort2 = 13552

const createMqttClient = (mqttPort: number) => {
    return mqtt.connectAsync(`mqtt://localhost:${mqttPort}`)
}

const grantPermissions = async (streams: Stream[], brokerUsers: Wallet[]) => {
    // TODO we could run these permission grants in parallel, but Core API can fail with
    // error Duplicate entry '...' for key 'username_idx' when it creates the
    // target users
    for await (const s of streams) {
        for await (const u of brokerUsers) {
            await s.grantPermission(StreamOperation.STREAM_GET, u.address)
            await s.grantPermission(StreamOperation.STREAM_SUBSCRIBE, u.address)
        }
    }
}

describe('broker subscriptions', () => {
    let tracker: Tracker
    let broker1: Broker
    let broker2: Broker
    const broker1User = createMockUser()
    const broker2User = createMockUser()
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
            privateKey: broker1User.privateKey,
            trackerPort,
            wsPort: wsPort1,
            extraPlugins: {
                mqtt: {
                    port: mqttPort1
                }
            }
        })
        broker2 = await startBroker({
            name: 'broker2',
            privateKey: broker2User.privateKey,
            trackerPort,
            wsPort: wsPort2,
            extraPlugins: {
                mqtt: {
                    port: mqttPort2
                }
            }
        })

        await wait(2000)

        client1 = createClient(tracker, privateKey)
        client2 = createClient(tracker, privateKey)

        mqttClient1 = await createMqttClient(mqttPort1)
        mqttClient2 = await createMqttClient(mqttPort2)

        freshStream1 = await createTestStream(client1, module)
        freshStream2 = await createTestStream(client2, module)
        await grantPermissions([freshStream1, freshStream2], [broker1User, broker2User])
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

    it('manage list of subscribed stream partitions when plugins subscribe/unsubscribe', async () => {
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

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])

        // client boots own node, so broker streams should not change
        await client1.subscribe(freshStream1, () => {})
        // subscribing twice should do nothing to count
        await mqttClient1.subscribe(freshStream2.id)

        await wait(500) // give some time for client1 to subscribe.

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])

        await mqttClient1.unsubscribe(freshStream1.id)
        
        await waitForCondition(() => getSPIDKeys(broker1).length === 1)
        await waitForCondition(() => getSPIDKeys(broker2).length === 2)

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([freshStream2.id + '#0'])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])

        await mqttClient1.unsubscribe(freshStream2.id)

        await waitForCondition(() => getSPIDKeys(broker1).length === 0)
        await waitForCondition(() => getSPIDKeys(broker2).length === 2)

        expect(getSPIDKeys(broker1)).toIncludeSameMembers([])
        expect(getSPIDKeys(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])
    }, 10000)
})
