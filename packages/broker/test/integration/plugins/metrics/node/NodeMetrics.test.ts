import StreamrClient from 'streamr-client'
import {Tracker} from 'streamr-network'
import { Wallet } from 'ethers'
import { startBroker, createClient, Queue, getPrivateKey, startTestTracker } from '../../../../utils'
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
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #1') // remove when CI flakyness issue has been resolved
        const tmpAccount = new Wallet(await getPrivateKey())
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #2') // remove when CI flakyness issue has been resolved
        const storageNodeAccount = new Wallet(await getPrivateKey())
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #3') // remove when CI flakyness issue has been resolved
        const storageNodeRegistry = {
            contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
            jsonRpcProvider: `http://${ process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1' }:8546`
        }
        nodeAddress = tmpAccount.address
        tracker = await startTestTracker(trackerPort)
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #4') // remove when CI flakyness issue has been resolved
        client1 = await createClient(tracker, await getPrivateKey(), {
            storageNodeRegistry: storageNodeRegistry,
        })
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #5') // remove when CI flakyness issue has been resolved
        client2 = await createClient(tracker, tmpAccount.privateKey, {
            storageNodeRegistry: storageNodeRegistry,
        })
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #6') // remove when CI flakyness issue has been resolved

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
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #7') // remove when CI flakyness issue has been resolved
        const storageClient = await createClient(tracker, storageNodeAccount.privateKey, {
            storageNodeRegistry: storageNodeRegistry,
        })
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #8') // remove when CI flakyness issue has been resolved
        await storageClient.setNode(`{"http": "http://127.0.0.1:${httpPort}/api/v1"}`)
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #9') // remove when CI flakyness issue has been resolved
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
        // eslint-disable-next-line no-console
        console.log('NodeMetricsTest #10') // remove when CI flakyness issue has been resolved
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
