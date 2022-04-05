import { MetricsContext, Logger } from 'streamr-network'

const logger = new Logger(module)

function formatNumber(n: number) {
    return n < 10 ? n.toFixed(1) : Math.round(n)
}

export class ConsoleMetrics {

    reportingIntervalSeconds: number
    metricsContext: MetricsContext
    timeout?: NodeJS.Timeout

    constructor(reportingIntervalSeconds: number, metricsContext: MetricsContext) {
        this.reportingIntervalSeconds = reportingIntervalSeconds
        this.metricsContext = metricsContext
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
        clearTimeout(this.timeout!)
    }

    async reportAndReset(): Promise<void> {
        const report = await this.metricsContext.report(true)

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
        const websocketMetrics = report.metrics['broker/ws']
        if (websocketMetrics !== undefined) {
            ongoingResends = websocketMetrics.numOfOngoingResends as number
            resendMeanAge = websocketMetrics.meanAgeOfOngoingResends as number
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
    }
}