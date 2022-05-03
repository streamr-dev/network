import StreamrClient, { StreamPermission } from 'streamr-client'
import { Tracker } from '@streamr/network-tracker'
import { Wallet } from 'ethers'
import { createClient, fetchPrivateKeyWithGas, startBroker, startTestTracker } from '../../../../utils'
import { Broker } from '../../../../../src/broker'
import { v4 as uuid } from 'uuid'
import { EthereumAddress, keyToArrayIndex } from 'streamr-client-protocol'
import { MetricsReport } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'

const trackerPort = 47745

const NUM_OF_PARTITIONS = 10

describe('NodeMetrics', () => {
    let tracker: Tracker
    let metricsGeneratingBroker: Broker
    let nodeAddress: EthereumAddress
    let client: StreamrClient
    let streamIdPrefix: string

    beforeAll(async () => {
        const tmpAccount = new Wallet(await fetchPrivateKeyWithGas())

        nodeAddress = tmpAccount.address
        tracker = await startTestTracker(trackerPort)
        client = await createClient(tracker, tmpAccount.privateKey)

        const stream = await client.createStream({
            id: `/metrics/nodes/${uuid()}/sec`,
            partitions: NUM_OF_PARTITIONS
        })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], user: nodeAddress })
        streamIdPrefix = stream.id.replace('sec', '')

        metricsGeneratingBroker = await startBroker({
            privateKey: tmpAccount.privateKey,
            trackerPort,
            extraPlugins: {
                metrics: {
                    nodeMetrics: {
                        streamIdPrefix
                    },
                }
            }
        })
    }, 80 * 1000)

    afterAll(async () => {
        await Promise.allSettled([
            tracker?.stop(),
            metricsGeneratingBroker.stop(),
            client?.destroy()
        ])
    })

    it('should retrieve the a `sec` metrics', async () => {
        let report: MetricsReport | undefined

        const id = `${streamIdPrefix}sec`
        const nodeId = (await metricsGeneratingBroker.getNode()).getNodeId()
        const partition = keyToArrayIndex(NUM_OF_PARTITIONS, nodeId.toLowerCase())

        await client.subscribe({ id, partition }, (content: any) => {
            const isReady = content.network.connections > 0
            if (isReady && (report === undefined)) {
                report = content
            }
        })

        await waitForCondition(() => report !== undefined, 15000, 100)
        expect(report!).toMatchObject({
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
