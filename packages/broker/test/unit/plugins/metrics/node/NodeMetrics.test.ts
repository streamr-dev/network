import { LevelMetric, MetricsContext } from 'streamr-network'
import { NodeMetrics } from '../../../../../src/plugins/metrics/node/NodeMetrics'
import { waitForCondition } from 'streamr-test-utils'
import StreamrClient from 'streamr-client'

const MOCK_METRICS_VALUE = 123
const MOCK_NODE_ID = '0x0000000000000000000000000000000000000000'

const createMockMetric = () => new LevelMetric()

describe('NodeMetrics', () => {

    let nodeMetrics: NodeMetrics
    let onPublish: jest.Mock
    let updateMockMetricsData: any

    beforeEach(() => {
        const metricsContext = new MetricsContext()
        const webRtcMetricsProducer = {
            inSpeed: createMockMetric(),
            outSpeed: createMockMetric(),
            connections: createMockMetric(),
            failedConnection: createMockMetric()
        }
        metricsContext.addMetrics('WebRtcEndpoint', webRtcMetricsProducer)
        const nodeMetricsProducer = {
            latency: createMockMetric()
        }
        metricsContext.addMetrics('node', nodeMetricsProducer)
        const nodePublishMetricsProducer = {
            bytes: createMockMetric(),
            count: createMockMetric()
        }
        metricsContext.addMetrics('node/publish', nodePublishMetricsProducer)
        const storageMetricsProducer = {
            readBytes: createMockMetric(),
            writeBytes: createMockMetric()
        }
        metricsContext.addMetrics('broker/cassandra', storageMetricsProducer)
        updateMockMetricsData = (value: number) => {
            webRtcMetricsProducer.inSpeed.record(value)
            webRtcMetricsProducer.outSpeed.record(value)
            webRtcMetricsProducer.connections.record(value)
            webRtcMetricsProducer.failedConnection.record(value)
            nodeMetricsProducer.latency.record(value)
            storageMetricsProducer.readBytes.record(value)
            storageMetricsProducer.writeBytes.record(value)
            nodePublishMetricsProducer.bytes.record(value)
            nodePublishMetricsProducer.count.record(value)
        }
        onPublish = jest.fn()
        const client: Pick<StreamrClient, 'publish' | 'getNode'> = {
            publish: onPublish,
            getNode: async () => {
                return {
                    getNodeId: () => MOCK_NODE_ID
                } as any
            }
        }
        nodeMetrics = new NodeMetrics(metricsContext, client as any, 'mock.eth/')
    })

    it('mock data from MetricsContext', async () => {
        updateMockMetricsData(MOCK_METRICS_VALUE)
        nodeMetrics.start()
        // this wait can take up to 10s 
        // (less than 5s to get initial values and another 5s to collect sampled data)
        // TODO: enable custom metrics intervals to be configured and use e.g. 100 ms interval here
        await waitForCondition(() => onPublish.mock.calls.length > 0, 11000, 100)
        expect(onPublish).toBeCalledWith('mock.eth/sec', {
            broker: {
                messagesToNetworkPerSec: MOCK_METRICS_VALUE,
                bytesToNetworkPerSec: MOCK_METRICS_VALUE
            },
            network: {
                avgLatencyMs: MOCK_METRICS_VALUE,
                bytesToPeersPerSec: MOCK_METRICS_VALUE,
                bytesFromPeersPerSec: MOCK_METRICS_VALUE,
                connections: MOCK_METRICS_VALUE,
                webRtcConnectionFailures: MOCK_METRICS_VALUE
            },
            storage: {
                bytesWrittenPerSec: MOCK_METRICS_VALUE,
                bytesReadPerSec: MOCK_METRICS_VALUE
            },
            period: {
                start: expect.anything(),
                end: expect.anything()
            }
        },
        undefined,
        MOCK_NODE_ID)
        nodeMetrics.stop()
    }, 11000)
})
