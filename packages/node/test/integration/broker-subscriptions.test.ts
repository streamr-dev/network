import { Wallet } from 'ethers'
import mqtt, { AsyncMqttClient } from 'async-mqtt'
import { StreamrClient, Stream, StreamPartID, StreamPermission } from '@streamr/sdk'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, until } from '@streamr/utils'
import { Broker } from '../../src/broker'
import { startBroker, createClient, createTestStream } from '../utils'

jest.setTimeout(50000)

const mqttPort1 = 13551
const mqttPort2 = 13552

const createMqttClient = (mqttPort: number) => {
    return mqtt.connectAsync(`mqtt://127.0.0.1:${mqttPort}`)
}

const grantPermissions = async (streams: Stream[], brokerUsers: Wallet[]) => {
    for (const s of streams) {
        const assignments = brokerUsers.map((user) => {
            return { permissions: [StreamPermission.SUBSCRIBE], userId: user.address }
        })
        await s.grantPermissions(...assignments)
    }
}

const getStreamParts = async (broker: Broker): Promise<StreamPartID[]> => {
    const client = broker.getStreamrClient()
    const subs = await client.getSubscriptions()
    return subs.map((s) => s.streamPartId)
}

describe('broker subscriptions', () => {
    let broker1: Broker
    let broker2: Broker
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream1: Stream
    let freshStream2: Stream
    let mqttClient1: AsyncMqttClient
    let mqttClient2: AsyncMqttClient

    beforeEach(async () => {
        const broker1User = fastWallet()
        const broker2User = fastWallet()
        broker1 = await startBroker({
            privateKey: broker1User.privateKey,
            extraPlugins: {
                mqtt: {
                    port: mqttPort1
                }
            }
        })
        broker2 = await startBroker({
            privateKey: broker2User.privateKey,
            extraPlugins: {
                mqtt: {
                    port: mqttPort2
                }
            }
        })

        client1 = createClient(await fetchPrivateKeyWithGas())
        client2 = createClient(await fetchPrivateKeyWithGas())

        mqttClient1 = await createMqttClient(mqttPort1)
        mqttClient2 = await createMqttClient(mqttPort2)

        freshStream1 = await createTestStream(client1, module)
        freshStream2 = await createTestStream(client2, module)
        await grantPermissions([freshStream1, freshStream2], [broker1User, broker2User])
    })

    afterEach(async () => {
        await Promise.allSettled([
            mqttClient1.end(true),
            mqttClient2.end(true),
            client1.destroy(),
            client2.destroy(),
            broker1.stop(),
            broker2.stop()
        ])
    })

    it('manage list of subscribed stream partitions when plugins subscribe/unsubscribe', async () => {
        await until(() => mqttClient1.connected)
        await until(() => mqttClient2.connected)

        await mqttClient1.subscribe(freshStream1.id)
        await mqttClient2.subscribe(freshStream2.id)

        await until(async () => (await getStreamParts(broker1)).length === 1)
        await until(async () => (await getStreamParts(broker2)).length === 1)

        expect(await getStreamParts(broker1)).toIncludeSameMembers([freshStream1.id + '#0'])
        expect(await getStreamParts(broker2)).toIncludeSameMembers([freshStream2.id + '#0'])

        await mqttClient1.subscribe(freshStream2.id)
        await mqttClient2.subscribe(freshStream1.id)

        await until(async () => (await getStreamParts(broker1)).length === 2)
        await until(async () => (await getStreamParts(broker2)).length === 2)

        expect(await getStreamParts(broker1)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])
        expect(await getStreamParts(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])

        // client boots own node, so broker streams should not change
        await client1.subscribe(freshStream1, () => {})
        // subscribing twice should do nothing to count
        await mqttClient1.subscribe(freshStream2.id)

        await wait(500) // give some time for client1 to subscribe.

        expect(await getStreamParts(broker1)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])
        expect(await getStreamParts(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])

        await mqttClient1.unsubscribe(freshStream1.id)

        await until(async () => (await getStreamParts(broker2)).length === 2)

        expect(await getStreamParts(broker1)).toIncludeSameMembers([freshStream2.id + '#0'])
        expect(await getStreamParts(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])

        await mqttClient1.unsubscribe(freshStream2.id)

        await until(async () => (await getStreamParts(broker2)).length === 2)

        expect(await getStreamParts(broker1)).toIncludeSameMembers([])
        expect(await getStreamParts(broker2)).toIncludeSameMembers([freshStream1.id + '#0', freshStream2.id + '#0'])
    })
})
