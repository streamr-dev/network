import StreamrClient, { StreamPermission } from 'streamr-client'
import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import { createClient, getPrivateKey, Queue, startBroker, startTestTracker } from '../../../../utils'
import { Broker } from '../../../../../src/broker'
import { v4 as uuid } from 'uuid'
import { keyToArrayIndex } from 'streamr-client-protocol'

const httpPort = 47741
const wsPort = 47742
const trackerPort = 47745

describe('NodeMetrics', () => {
    let tracker: Tracker
    let broker1: Broker
    let storageNode: Broker
    let client1: StreamrClient
    // let nodeAddress: string
    let client2: StreamrClient
    let streamIdPrefix: string

    beforeAll(async () => {
        const tmpAccount = new Wallet(await getPrivateKey())
        const storageNodeAccount = new Wallet(await getPrivateKey())
        const storageNodeRegistry = {
            contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
            jsonRpcProvider: `http://10.200.10.1:8546`
        }
        // nodeAddress = tmpAccount.address
        tracker = await startTestTracker(trackerPort)
        // eslint-disable-next-line no-console
        console.log("HERE1")
        client1 = await createClient(tracker, await getPrivateKey(), {
            storageNodeRegistry: storageNodeRegistry,
        })
        // eslint-disable-next-line no-console
        console.log("HERE2")
        client2 = await createClient(tracker, tmpAccount.privateKey, {
            storageNodeRegistry: storageNodeRegistry,
        })
        // eslint-disable-next-line no-console
        console.log("HERE3")

        const secStream = await client2.getOrCreateStream({ id: `/metrics/nodes/${uuid()}/sec`, partitions: 10})
        await secStream.grantPublicPermission(StreamPermission.PUBLISH)
        await secStream.grantPublicPermission(StreamPermission.SUBSCRIBE)

        streamIdPrefix = secStream.id.replace('sec', '')

        const minStream = await client2.getOrCreateStream({ id: `${streamIdPrefix}/min`, partitions: 10})
        await minStream.grantPublicPermission(StreamPermission.PUBLISH)
        await minStream.grantPublicPermission(StreamPermission.SUBSCRIBE)

        const hourStream = await client2.getOrCreateStream({ id: `${streamIdPrefix}/hour`, partitions: 10})
        await hourStream.grantPublicPermission(StreamPermission.PUBLISH)
        await hourStream.grantPublicPermission(StreamPermission.SUBSCRIBE)

        const dayStream = await client2.getOrCreateStream({ id: `${streamIdPrefix}/day`, partitions: 10})
        await dayStream.grantPublicPermission(StreamPermission.PUBLISH)
        await dayStream.grantPublicPermission(StreamPermission.SUBSCRIBE)

        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            httpPort,
            enableCassandra: true,
            storageNodeRegistry,
            storageConfigRefreshInterval: 3000 // The streams are created deep inside `startBroker`,
            // therefore StorageAssignmentEventManager test helper cannot be used
        })
        const storageClient = await createClient(tracker, storageNodeAccount.privateKey, {
            storageNodeRegistry: storageNodeRegistry,
        })
        await storageClient.setNode(`{"http": "http://127.0.0.1:${httpPort}/api/v1"}`)
        broker1 = await startBroker({
            name: 'broker1',
            privateKey: tmpAccount.privateKey,
            trackerPort,
            wsPort,
            extraPlugins: {
                metrics: {
                    consoleAndPM2IntervalInSeconds: 0,
                    nodeMetrics: {
                        client: {
                            wsUrl: `ws://127.0.0.1:${wsPort}/api/v1/ws`,
                            httpUrl: `http://127.0.0.1:${httpPort}/api/v1`,
                        },
                        storageNode: storageNodeAccount.address,
                        streamIdPrefix
                    },

                }
            },
            storageNodeRegistry
        })
        // eslint-disable-next-line no-console
        console.log("HERE4")
    }, 80 * 1000)

    afterAll(async () => {
        await Promise.allSettled([
            tracker?.stop(),
            broker1?.stop(),
            storageNode?.stop(),
            client1?.destroy(),
            client2?.destroy()
        ])
    })

    it('should retrieve the a `sec` metrics', async () => {
        const messageQueue = new Queue<any>()

        const streamId = `${streamIdPrefix}sec`
        const streamPartition = keyToArrayIndex(10, (await client2.getUserInfo()).username)
        // eslint-disable-next-line no-console
        console.log("HERE111")
        await client2.subscribe({ streamId, streamPartition }, (content: any) => {
            messageQueue.push({ content })
        })
        // eslint-disable-next-line no-console
        console.log("HERE111")
        const message = await messageQueue.pop(30 * 1000)
        expect(message.content).toMatchObject({
            broker: {
                messagesToNetworkPerSec: expect.any(Number),
                bytesToNetworkPerSec: expect.any(Number)
            },
            network: {
                avgLatencyMs: expect.any(Number),
                bytesToPeersPerSec: expect.any(Number),
                bytesFromPeersPerSec: expect.any(Number),
                connections: expect.any(Number),
                webRtcConnectionFailures: expect.any(Number)
            },
            period: {
                start: expect.any(Number),
                end: expect.any(Number)
            }
        })
    }, 35000)
})
