import { MetricsContext } from 'streamr-network'
import { Sample } from '../../../../../src/plugins/metrics/node/Sample'
import { NodeMetrics } from '../../../../../src/plugins/metrics/node/NodeMetrics'

const getTime = (dateStr: string): number => {
    return new Date(dateStr).getTime()
}

const getPeriod = (sample: Sample): { start: string, end: string } => {
    const { period } = sample
    return {
        start: new Date(period.start).toISOString(),
        end: new Date(period.end).toISOString()
    }
}

const MOCK_METRICS_VALUE = 123

describe('NodeMetrics', () => {

    let nodeMetrics: NodeMetrics
    let publishListener: any
    let updateMockMetricsData: any

    beforeEach(() => {
        const metricsContext = new MetricsContext('')
        const webRtcMetricsProducer = metricsContext.create('WebRtcEndpoint')
            .addRecordedMetric('inSpeed')
            .addRecordedMetric('outSpeed')
            .addQueriedMetric('connections', () => MOCK_METRICS_VALUE)
            .addRecordedMetric('failedConnection')
        const nodeMetricsProducer = metricsContext.create('node')
            .addFixedMetric('latency')
        const nodePublishMetricsProducer = metricsContext.create('node/publish')
            .addRecordedMetric('bytes')
            .addRecordedMetric('count')
        const storageMetricsProducer = metricsContext.create('broker/cassandra')
            .addRecordedMetric('readBytes')
            .addRecordedMetric('writeBytes')
        updateMockMetricsData = (value: number) => {
            webRtcMetricsProducer.record('inSpeed', value)
            webRtcMetricsProducer.record('outSpeed', value)
            webRtcMetricsProducer.record('failedConnection', value)
            nodeMetricsProducer.set('latency', value)
            storageMetricsProducer.record('readBytes', value)
            storageMetricsProducer.record('writeBytes', value)
            nodePublishMetricsProducer.record('bytes', value)
            nodePublishMetricsProducer.record('count', value)
        }
        publishListener = jest.fn()
        nodeMetrics = new NodeMetrics(metricsContext, {
            publish: async (sample: Sample) => publishListener(sample)
        } as any)
    })

    it('primary sample collected', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:05Z'))
        expect(publishListener).toBeCalledTimes(1)
        expect(getPeriod(publishListener.mock.calls[0][0])).toEqual({
            start: '2000-01-02T03:04:00.000Z',
            end: '2000-01-02T03:04:05.000Z'
        })
    })

    it('minute aggregation', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:30Z'))
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:05:10Z'))
        expect(publishListener).toBeCalledTimes(3)
        expect(getPeriod(publishListener.mock.calls[2][0])).toEqual({
            start: '2000-01-02T03:04:00.000Z',
            end: '2000-01-02T03:05:00.000Z'
        })
    })

    it('minute aggregation, exactly', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:05:00Z'))
        expect(publishListener).toBeCalledTimes(2)
        expect(getPeriod(publishListener.mock.calls[1][0])).toEqual({
            start: '2000-01-02T03:04:00.000Z',
            end: '2000-01-02T03:05:00.000Z'
        })
    })

    it('hour aggregation', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:30Z'))
        await nodeMetrics!.collectSample(getTime('2000-01-02T04:05:10Z'))
        expect(publishListener).toBeCalledTimes(4)
        expect(getPeriod(publishListener.mock.calls[2][0])).toEqual({
            start: '2000-01-02T03:04:00.000Z',
            end: '2000-01-02T03:05:00.000Z'
        })
        expect(getPeriod(publishListener.mock.calls[3][0])).toEqual({
            start: '2000-01-02T03:00:00.000Z',
            end: '2000-01-02T04:00:00.000Z'
        })
    })

    it('hour aggregation, exactly', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T04:00:00Z'))
        expect(publishListener).toBeCalledTimes(3)
        expect(getPeriod(publishListener.mock.calls[1][0])).toEqual({
            start: '2000-01-02T03:59:00.000Z',
            end: '2000-01-02T04:00:00.000Z'
        })
        expect(getPeriod(publishListener.mock.calls[2][0])).toEqual({
            start: '2000-01-02T03:00:00.000Z',
            end: '2000-01-02T04:00:00.000Z'
        })
    })

    it('day aggregation', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:30Z'))
        await nodeMetrics!.collectSample(getTime('2000-01-03T04:05:10Z'))
        expect(publishListener).toBeCalledTimes(5)
        expect(getPeriod(publishListener.mock.calls[2][0])).toEqual({
            start: '2000-01-02T03:04:00.000Z',
            end: '2000-01-02T03:05:00.000Z'
        })
        expect(getPeriod(publishListener.mock.calls[3][0])).toEqual({
            start: '2000-01-02T03:00:00.000Z',
            end: '2000-01-02T04:00:00.000Z'
        })
        expect(getPeriod(publishListener.mock.calls[4][0])).toEqual({
            start: '2000-01-02T00:00:00.000Z',
            end: '2000-01-03T00:00:00.000Z'
        })
    })

    it('day aggregation, exactly', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-03T00:00:00Z'))
        expect(publishListener).toBeCalledTimes(4)
        expect(getPeriod(publishListener.mock.calls[1][0])).toEqual({
            start: '2000-01-02T23:59:00.000Z',
            end: '2000-01-03T00:00:00.000Z'
        })
        expect(getPeriod(publishListener.mock.calls[2][0])).toEqual({
            start: '2000-01-02T23:00:00.000Z',
            end: '2000-01-03T00:00:00.000Z'
        })
        expect(getPeriod(publishListener.mock.calls[3][0])).toEqual({
            start: '2000-01-02T00:00:00.000Z',
            end: '2000-01-03T00:00:00.000Z'
        })
    })

    it('no data from MetricsContext', async () => {
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:05Z'))
        expect(publishListener).toBeCalledTimes(1)
        expect(publishListener).toBeCalledWith({
            broker: {
                messagesToNetworkPerSec: 0,
                bytesToNetworkPerSec: 0
            },
            network: {
                avgLatencyMs: 0,
                bytesToPeersPerSec: 0,
                bytesFromPeersPerSec: 0,
                connections: MOCK_METRICS_VALUE,
                webRtcConnectionFailures: 0
            },
            storage: {
                bytesWrittenPerSec: 0,
                bytesReadPerSec: 0
            },
            period: {
                start: getTime('2000-01-02T03:04:00.000Z'),
                end: getTime('2000-01-02T03:04:05.000Z')
            }
        })
    })

    it('mock data from MetricsContext', async () => {
        updateMockMetricsData(MOCK_METRICS_VALUE)
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:05Z'))
        expect(publishListener).toBeCalledTimes(1)
        expect(publishListener).toBeCalledWith({
            broker: {
                messagesToNetworkPerSec: 123,
                bytesToNetworkPerSec: 123
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
                start: getTime('2000-01-02T03:04:00.000Z'),
                end: getTime('2000-01-02T03:04:05.000Z')
            }
        })
    })

    it('calculates minute average', async () => {
        updateMockMetricsData(10)
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:04:05Z'))
        updateMockMetricsData(30)
        await nodeMetrics!.collectSample(getTime('2000-01-02T03:05:05Z'))
        expect(publishListener).toBeCalledTimes(3)
        const minuteReport = publishListener.mock.calls[2][0]
        // - for broker.avgLatencyMs we know the exact sample values as it is produced using addFixedMetric
        // - for most of the others we know that the value is between 10-30 as the value is 
        //   produced using addRecordedMetric
        // - for network.connections we use the constant value as it is produced using addQueriedMetric
        // TODO use https://github.com/jest-community/jest-extended#tobewithinstart-end
        expect(minuteReport).toMatchObject({
            broker: {
                messagesToNetworkPerSec: expect.any(Number),
                bytesToNetworkPerSec: expect.any(Number)
            },
            network: {
                avgLatencyMs: 20,
                bytesToPeersPerSec: expect.any(Number),
                bytesFromPeersPerSec: expect.any(Number),
                connections: MOCK_METRICS_VALUE,
                webRtcConnectionFailures: expect.any(Number)
            },
            storage: {
                bytesWrittenPerSec: expect.any(Number),
                bytesReadPerSec: expect.any(Number)
            },
            period: {
                start: getTime('2000-01-02T03:04:00.00Z'),
                end: getTime('2000-01-02T03:05:00.00Z')
            }
        })
    })
})
