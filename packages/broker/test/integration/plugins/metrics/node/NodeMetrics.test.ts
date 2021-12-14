import StreamrClient from 'streamr-client'
import {Tracker} from 'streamr-network'
import { Wallet } from 'ethers'
import { startBroker, createClient, Queue, getPrivateKey } from '../../../../utils'
import { Broker } from '../../../../../src/broker'

const httpPort = 47741
const wsPort = 47742
const trackerPort = 47745

jest.setTimeout(60000)

describe('NodeMetrics', () => {
    let tracker: Tracker
    let broker1: Broker
    let storageNode: Broker
    let client1: StreamrClient
    let nodeAddress: string
    let client2: StreamrClient

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
                        storageNode: storageNodeAccount.address
                    }
                }
            },
            storageNodeRegistry
        })
    })

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
        const streamId = `${nodeAddress.toLowerCase()}/streamr/node/metrics/sec`
        await client2.subscribe(streamId, (content: any) => {
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
    })
})
