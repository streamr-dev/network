import StreamrClient, { StreamPermission } from 'streamr-client'
import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import { createClient, fetchPrivateKeyWithGas, Queue, startBroker, startTestTracker } from '../../../../utils'
import { Broker } from '../../../../../src/broker'
import { v4 as uuid } from 'uuid'
import { EthereumAddress, keyToArrayIndex } from 'streamr-client-protocol'

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
            name: 'broker1',
            privateKey: tmpAccount.privateKey,
            trackerPort,
            extraPlugins: {
                metrics: {
                    consoleAndPM2IntervalInSeconds: 0,
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
        const messageQueue = new Queue<any>()

        const id = `${streamIdPrefix}sec`
        const nodeId = (await metricsGeneratingBroker.getNode()).getNodeId()
        const partition = keyToArrayIndex(NUM_OF_PARTITIONS, nodeId.toLowerCase())

        await client.subscribe({ id, partition }, (content: any) => {
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
