import { keyToArrayIndex } from 'streamr-client-protocol'
import { MetricsReport } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { fetchPrivateKeyWithGas, getCreateClient } from '../test-utils/utils'

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
                ]
            }
        })
        stream = await generatorClient.createStream({
            id: streamPath,
            partitions: NUM_OF_PARTITIONS
        })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        subscriberClient = await createClient()
    }, 20 * 1000)

    afterAll(async () => {
        await Promise.allSettled([
            generatorClient?.stop(),
            subscriberClient?.destroy()
        ])
    })

    it('should retrieve a metrics report', async () => {
        let report: MetricsReport | undefined

        const nodeAddress = (await generatorClient.getAddress()).toLowerCase()
        const partition = keyToArrayIndex(NUM_OF_PARTITIONS, nodeAddress)

        await subscriberClient.subscribe({ id: stream.id, partition }, (content: any) => {
            const isReady = content.node.connectionAverageCount > 0
            if (isReady && (report === undefined)) {
                report = content
            }
        })

        // trigger metrics generation start by subcribing to some stream
        const dummyStream = await generatorClient.createStream(`/${Date.now()}`)
        await generatorClient.subscribe(dummyStream, () => {})

        await waitForCondition(() => report !== undefined)
        expect(report!).toMatchObject({
            node: {
                publishMessagesPerSecond: expect.any(Number),
                publishBytesPerSecond: expect.any(Number),
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
    }, 20 * 1000)
})
