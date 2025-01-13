import { until, keyToArrayIndex, MetricsReport } from '@streamr/utils'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { getCreateClient, createTestClient } from '../test-utils/utils'

const NUM_OF_PARTITIONS = 10

describe('NodeMetrics', () => {
    let generatorClient: StreamrClient
    let subscriberClient: StreamrClient
    let stream: Stream
    const createClient = getCreateClient()

    beforeAll(async () => {
        const streamPath = `/metrics/${Date.now()}`
        const generatorClientPrivateKey = await fetchPrivateKeyWithGas()
        generatorClient = await createClient({
            auth: {
                privateKey: generatorClientPrivateKey
            },
            metrics: {
                periods: [
                    {
                        duration: 100,
                        streamId: streamPath
                    }
                ],
                maxPublishDelay: 50
            }
        })
        stream = await generatorClient.createStream({
            id: streamPath,
            partitions: NUM_OF_PARTITIONS
        })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        subscriberClient = createTestClient(await fetchPrivateKeyWithGas(), 15653)
    }, 30 * 1000)

    afterAll(async () => {
        await Promise.allSettled([generatorClient.destroy(), subscriberClient.destroy()])
    })

    it(
        'should retrieve a metrics report',
        async () => {
            let report: MetricsReport | undefined

            const partition = keyToArrayIndex(NUM_OF_PARTITIONS, await generatorClient.getNodeId())
            await subscriberClient.subscribe({ id: stream.id, partition }, (content: any) => {
                const isReady = content.node.connectionAverageCount > 0
                if (isReady && report === undefined) {
                    report = content
                }
            })

            // trigger metrics generation start by subscribing to some stream
            const dummyStream = await generatorClient.createStream(`/${Date.now()}`)
            await generatorClient.subscribe(dummyStream, () => {})

            await until(() => report !== undefined, 10000)
            expect(report!).toMatchObject({
                node: {
                    id: await generatorClient.getNodeId(),
                    broadcastMessagesPerSecond: expect.any(Number),
                    broadcastBytesPerSecond: expect.any(Number),
                    sendMessagesPerSecond: expect.any(Number),
                    sendBytesPerSecond: expect.any(Number),
                    receiveMessagesPerSecond: expect.any(Number),
                    receiveBytesPerSecond: expect.any(Number),
                    connectionAverageCount: expect.any(Number),
                    connectionTotalFailureCount: expect.any(Number)
                },
                period: {
                    start: expect.any(Number),
                    end: expect.any(Number)
                }
            })
        },
        30 * 1000
    )
})
