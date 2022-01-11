import StreamrClient, { StreamPermission } from 'streamr-client'
import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import { createClient, getPrivateKey, Queue, startBroker, startTestTracker } from '../../../../utils'
import { Broker } from '../../../../../src/broker'
import { v4 as uuid } from 'uuid'
import { keyToArrayIndex } from 'streamr-client-protocol'

const httpPort = 47741
const trackerPort = 47745

describe('NodeMetrics', () => {
    let tracker: Tracker
    let broker1: Broker
    let storageNode: Broker
    let client1: StreamrClient
    let nodeAddress: string
    let client2: StreamrClient
    let streamIdPrefix: string

    beforeAll(async () => {
        const tmpAccount = new Wallet(await getPrivateKey())
        const storageNodeAccount = new Wallet(await getPrivateKey())
        const storageNodeRegistry = {
            contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
            jsonRpcProvider: `http://10.200.10.1:8546`
        }
        nodeAddress = tmpAccount.address
        tracker = await startTestTracker(trackerPort)
        client1 = await createClient(tracker, await getPrivateKey(), {
            storageNodeRegistry: storageNodeRegistry,
        })
        client2 = await createClient(tracker, tmpAccount.privateKey, {
            storageNodeRegistry: storageNodeRegistry,
        })

        const stream = await client2.getOrCreateStream({ id: `/metrics/nodes/${uuid()}/sec`, partitions: 10})
        await stream.grantUserPermission(StreamPermission.PUBLISH, nodeAddress)
        await stream.grantUserPermission(StreamPermission.SUBSCRIBE, nodeAddress)
        streamIdPrefix = stream.id.replace('sec', '')

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
            extraPlugins: {
                metrics: {
                    consoleAndPM2IntervalInSeconds: 0,
                    nodeMetrics: {
                        storageNode: storageNodeAccount.address,
                        streamIdPrefix
                    },

                }
            },
            storageNodeRegistry
        })
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
        const streamPartition = keyToArrayIndex(10, 'key')
        await client2.subscribe({ streamId, streamPartition }, (content: any) => {
            messageQueue.push({ content })
        })
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
