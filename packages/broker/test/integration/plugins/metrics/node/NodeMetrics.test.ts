import StreamrClient, { StreamPermission } from 'streamr-client'
import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import { createClient, getPrivateKey, Queue, startBroker, startTestTracker } from '../../../../utils'
import { Broker } from '../../../../../src/broker'
import { v4 as uuid } from 'uuid'
import { keyToArrayIndex } from 'streamr-client-protocol'

const httpPort = 47741
const trackerPort = 47745

const NUM_OF_PARTITIONS = 10

describe('NodeMetrics', () => {
    let tracker: Tracker
    let metricsGeneratingBroker: Broker
    let storageNode: Broker
    let client1: StreamrClient
    let nodeAddress: string
    let client2: StreamrClient
    let streamIdPrefix: string

    beforeAll(async () => {
        const tmpAccount = new Wallet(await getPrivateKey())
        const storageNodeAccount = new Wallet(await getPrivateKey())
        const storageNodeRegistry = {
            contractAddress: '0x231b810D98702782963472e1D60a25496999E75D',
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

        const stream = await client2.createStream({
            id: `/metrics/nodes/${uuid()}/sec`,
            partitions: NUM_OF_PARTITIONS
        })
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
            storageConfigRefreshInterval: 3000
        })
        const storageClient = await createClient(tracker, storageNodeAccount.privateKey, {
            storageNodeRegistry: storageNodeRegistry,
        })
        await storageClient.setNode(`{"http": "http://127.0.0.1:${httpPort}/api/v1"}`)
        metricsGeneratingBroker = await startBroker({
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
            metricsGeneratingBroker.stop(),
            storageNode?.stop(),
            client1?.destroy(),
            client2?.destroy()
        ])
    })

    it('should retrieve the a `sec` metrics', async () => {
        const messageQueue = new Queue<any>()

        const id = `${streamIdPrefix}sec`
        const partition = keyToArrayIndex(NUM_OF_PARTITIONS, metricsGeneratingBroker.getNodeId().toLowerCase())

        await client2.subscribe({ id, partition }, (content: any) => {
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
