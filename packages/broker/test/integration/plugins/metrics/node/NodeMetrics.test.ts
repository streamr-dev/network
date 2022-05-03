import StreamrClient, { StreamPermission } from 'streamr-client'
import { Tracker } from '@streamr/network-tracker'
import { Wallet } from 'ethers'
import { createClient, fetchPrivateKeyWithGas, startBroker, startTestTracker, STREAMR_DOCKER_DEV_HOST } from '../../../../utils'
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
        const brokerWallet = new Wallet(await fetchPrivateKeyWithGas())

        nodeAddress = brokerWallet.address
        tracker = await startTestTracker(trackerPort)
        client = await createClient(tracker, brokerWallet.privateKey)

        const stream = await client.createStream({
            id: `/metrics/nodes/${uuid()}/sec`,
            partitions: NUM_OF_PARTITIONS
        })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], user: nodeAddress })
        streamIdPrefix = stream.id.replace('sec', '')
        // a previous test run may have created the assignment stream
        await client.getOrCreateStream({
            id: '/assignments'
        })

        metricsGeneratingBroker = await startBroker({
            privateKey: brokerWallet.privateKey,
            trackerPort,
            extraPlugins: {
                metrics: {
                    nodeMetrics: {
                        streamIdPrefix
                    }
                },
                storage: {
                    cassandra: {
                        hosts: [STREAMR_DOCKER_DEV_HOST],
                        datacenter: 'datacenter1',
                        username: '',
                        password: '',
                        keyspace: 'streamr_dev_v2',
                    },
                    storageConfig: {
                        refreshInterval: 0
                    }
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
            const isReady = content.node.connectionAverageCount > 0
            if (isReady && (report === undefined)) {
                report = content
            }
        })

        await waitForCondition(() => report !== undefined, 15000, 100)
        expect(report!).toMatchObject({
            node: {
                publishMessagesPerSecond: expect.any(Number),
                publishBytesPerSecond: expect.any(Number),
                latencyAverageMs: expect.any(Number),
                sendMessagesPerSecond: expect.any(Number),
                sendBytesPerSecond: expect.any(Number),
                receiveMessagesPerSecond: expect.any(Number),
                receiveBytesPerSecond: expect.any(Number),
                connectionAverageCount: expect.any(Number),
                connectionTotalFailureCount: expect.any(Number)
            },
            broker: {
                plugin: {
                    storage: {
                        readMessagesPerSecond: expect.any(Number),
                        readBytesPerSecond: expect.any(Number),
                        writeMessagesPerSecond: expect.any(Number),
                        writeBytesPerSecond: expect.any(Number),
                        resendLastQueriesPerSecond: expect.any(Number),
                        resendFromQueriesPerSecond: expect.any(Number),
                        resendRangeQueriesPerSecond: expect.any(Number)
                    }
                }
            },
            period: {
                start: expect.any(Number),
                end: expect.any(Number)
            }
        })
    }, 35000)
})
