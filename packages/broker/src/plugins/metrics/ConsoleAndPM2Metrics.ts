import io from '@pm2/io'
import Gauge from '@pm2/io/build/main/utils/metrics/gauge'
import { MetricsContext, Logger } from 'streamr-network'

const logger = new Logger(module)

function formatNumber(n: number) {
    return n < 10 ? n.toFixed(1) : Math.round(n)
}

export class ConsoleAndPM2Metrics {

    reportingIntervalSeconds: number
    metricsContext: MetricsContext
    timeout?: NodeJS.Timeout
    brokerConnectionCountMetric: Gauge
    eventsInPerSecondMetric: Gauge
    eventsOutPerSecondMetric: Gauge
    kbInPerSecondMetric: Gauge
    kbOutPerSecondMetric: Gauge
    storageReadPerSecondMetric: Gauge
    storageWritePerSecondMetric: Gauge
    storageReadKbPerSecondMetric: Gauge
    storageWriteKbPerSecondMetric: Gauge
    totalBufferSizeMetric: Gauge
    ongoingResendsMetric: Gauge
    meanResendAgeMetric: Gauge
    totalBatchesMetric: Gauge
    meanBatchAge: Gauge
    messageQueueSizeMetric: Gauge

    constructor(reportingIntervalSeconds: number, metricsContext: MetricsContext) {
        this.reportingIntervalSeconds = reportingIntervalSeconds
        this.metricsContext = metricsContext
        this.brokerConnectionCountMetric = io.metric({
            name: 'brokerConnectionCountMetric'
        })
        this.eventsInPerSecondMetric = io.metric({
            name: 'eventsIn/sec'
        })
        this.eventsOutPerSecondMetric = io.metric({
            name: 'eventsOut/sec'
        })
        this.kbInPerSecondMetric = io.metric({
            name: 'kbIn/sec'
        })
        this.kbOutPerSecondMetric = io.metric({
            name: 'kbOut/sec'
        })
        this.storageReadPerSecondMetric = io.metric({
            name: 'storageRead/sec'
        })
        this.storageWritePerSecondMetric = io.metric({
            name: 'storageWrite/sec'
        })
        this.storageReadKbPerSecondMetric = io.metric({
            name: 'storageReadKb/sec'
        })
        this.storageWriteKbPerSecondMetric = io.metric({
            name: 'storageWriteKb/sec'
        })
        this.totalBufferSizeMetric = io.metric({
            name: 'totalBufferSize'
        })
        this.ongoingResendsMetric = io.metric({
            name: 'ongoingResends'
        })
        this.meanResendAgeMetric = io.metric({
            name: 'meanResendAge'
        })
        this.totalBatchesMetric = io.metric({
            name: 'totalBatches'
        })
        this.meanBatchAge = io.metric({
            name: 'meanBatchAge'
        })
        this.messageQueueSizeMetric = io.metric({
            name: 'messageQueueSize'
        })
    }

    start(): void {
        logger.info('starting legacy metrics reporting interval')
        const reportingIntervalInMs = this.reportingIntervalSeconds * 1000
        const reportFn = async () => {
            try {
                await this.reportAndReset()
            } catch (e) {
                logger.warn(`Error reporting metrics ${e}`)
            }
            this.timeout = setTimeout(reportFn, reportingIntervalInMs)
        }
        this.timeout = setTimeout(reportFn, reportingIntervalInMs)
    }

    stop(): void {
        io.destroy()
        clearTimeout(this.timeout!)
    }

    async reportAndReset(): Promise<void> {
        const report = await this.metricsContext.report(true)

        // @ts-expect-error not enough typing info available
        const outPerSecond = (report.metrics['broker/ws'] ? report.metrics['broker/ws'].outMessages.rate : 0)
            // @ts-expect-error not enough typing info available
            + (report.metrics['broker/http'] ? report.metrics['broker/http'].outMessages.rate : 0)
        // @ts-expect-error not enough typing info available
        const kbOutPerSecond = ((report.metrics['broker/ws'] ? report.metrics['broker/ws'].outBytes.rate : 0)
            // @ts-expect-error not enough typing info available
            + (report.metrics['broker/http'] ? report.metrics['broker/http'].outBytes.rate : 0)) / 1000

        let storageReadCountPerSecond = 0
        let storageWriteCountPerSecond = 0
        let storageReadKbPerSecond = 0
        let storageWriteKbPerSecond = 0
        let totalBatches = 0
        let meanBatchAge = 0
        if (report.metrics['broker/cassandra']) {
            // @ts-expect-error not enough typing info available
            storageReadCountPerSecond = report.metrics['broker/cassandra'].readCount.rate
            // @ts-expect-error not enough typing info available
            storageWriteCountPerSecond = report.metrics['broker/cassandra'].writeCount.rate
            // @ts-expect-error not enough typing info available
            storageReadKbPerSecond = report.metrics['broker/cassandra'].readBytes.rate / 1000
            // @ts-expect-error not enough typing info available
            storageWriteKbPerSecond = report.metrics['broker/cassandra'].writeBytes.rate / 1000
            // @ts-expect-error not enough typing info available
            totalBatches = report.metrics['broker/cassandra'].batchManager.totalBatches
            // @ts-expect-error not enough typing info available
            meanBatchAge = report.metrics['broker/cassandra'].batchManager.meanBatchAge
        }

        const brokerConnectionCount = (report.metrics['broker/ws'] ? report.metrics['broker/ws'].connections : 0)

        const networkConnectionCount = report.metrics.WebRtcEndpoint.connections
        // @ts-expect-error not enough typing info available
        const networkInPerSecond = report.metrics.WebRtcEndpoint.msgInSpeed.rate
        // @ts-expect-error not enough typing info available
        const networkOutPerSecond = report.metrics.WebRtcEndpoint.msgOutSpeed.rate
        // @ts-expect-error not enough typing info available
        const networkKbInPerSecond = report.metrics.WebRtcEndpoint.inSpeed.rate / 1000
        // @ts-expect-error not enough typing info available
        const networkKbOutPerSecond = report.metrics.WebRtcEndpoint.outSpeed.rate / 1000
        const { messageQueueSize } = report.metrics.WebRtcEndpoint

        let ongoingResends = 0
        let resendMeanAge = 0
        let totalBuffer = report.metrics.WebRtcEndpoint.totalWebSocketBuffer as number
        const websocketMetrics = report.metrics['broker/ws']
        if (websocketMetrics !== undefined) {
            ongoingResends = websocketMetrics.numOfOngoingResends as number
            resendMeanAge = websocketMetrics.meanAgeOfOngoingResends as number
            totalBuffer += websocketMetrics.totalWebSocketBuffer as number
        }

        logger.info(
            'Report\n'
            + '\tBroker connections: %d\n'
            + '\tNetwork connections %d\n'
            + '\tQueued messages: %d\n'
            + '\tNetwork in: %d events/s, %d kb/s\n'
            + '\tNetwork out: %d events/s, %d kb/s\n'
            + '\tStorage read: %d events/s, %d kb/s\n'
            + '\tStorage write: %d events/s, %d kb/s\n'
            + '\tTotal ongoing resends: %d (mean age %d ms)\n'
            + '\tTotal batches: %d (mean age %d ms)\n',
            brokerConnectionCount,
            networkConnectionCount,
            messageQueueSize,
            formatNumber(networkInPerSecond),
            formatNumber(networkKbInPerSecond),
            formatNumber(networkOutPerSecond),
            formatNumber(networkKbOutPerSecond),
            formatNumber(storageReadCountPerSecond),
            formatNumber(storageReadKbPerSecond),
            formatNumber(storageWriteCountPerSecond),
            formatNumber(storageWriteKbPerSecond),
            ongoingResends,
            resendMeanAge,
            totalBatches,
            meanBatchAge
        )

        this.eventsOutPerSecondMetric.set(outPerSecond)
        this.kbOutPerSecondMetric.set(kbOutPerSecond)
        this.storageReadPerSecondMetric.set(storageReadCountPerSecond)
        this.storageWritePerSecondMetric.set(storageWriteCountPerSecond)
        this.storageReadKbPerSecondMetric.set(storageReadKbPerSecond)
        this.storageWriteKbPerSecondMetric.set(storageWriteKbPerSecond)
        this.brokerConnectionCountMetric.set(brokerConnectionCount)
        this.totalBufferSizeMetric.set(totalBuffer)
        this.ongoingResendsMetric.set(ongoingResends)
        this.meanResendAgeMetric.set(resendMeanAge)
        this.messageQueueSizeMetric.set(messageQueueSize)
        if (report.metrics['broker/cassandra']) {
            this.totalBatchesMetric.set(totalBatches)
            this.meanBatchAge.set(meanBatchAge)
        }
    }
}