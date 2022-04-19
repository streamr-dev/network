import { Schema } from 'ajv'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

function formatNumber(n: number) {
    return n < 10 ? n.toFixed(1) : Math.round(n)
}

export interface ConsoleMetricsPluginConfig {
    interval: number
}

export class ConsoleMetricsPlugin extends Plugin<ConsoleMetricsPluginConfig> {

    private timeout?: NodeJS.Timeout

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        const reportingIntervalInMs = this.pluginConfig.interval * 1000
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
    
    async stop(): Promise<void> {
        clearTimeout(this.timeout!)
    }
    
    async reportAndReset(): Promise<void> {
        const metricsContext = (await (this.streamrClient!.getNode())).getMetricsContext()
        const report = await metricsContext.report(true)

        let storageReadCountPerSecond = 0
        let storageWriteCountPerSecond = 0
        let storageReadKbPerSecond = 0
        let storageWriteKbPerSecond = 0
        let totalBatches = 0
        let meanBatchAge = 0
        let resendRate = {
            last: 0,
            from: 0,
            range: 0
        }
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

        const storageQueryMetrics = report.metrics['broker/storage/query']
        if (storageQueryMetrics !== undefined) {
            resendRate = {
                last: (storageQueryMetrics.lastRequests as any).rate,
                from: (storageQueryMetrics.fromRequests as any).rate,
                range: (storageQueryMetrics.rangeRequests as any).rate
            }
        }

        logger.info(
            'Report\n'
            + '\tNetwork connections %d\n'
            + '\tQueued messages: %d\n'
            + '\tNetwork in: %d events/s, %d kb/s\n'
            + '\tNetwork out: %d events/s, %d kb/s\n'
            + '\tStorage read: %d events/s, %d kb/s\n'
            + '\tStorage write: %d events/s, %d kb/s\n'
            + '\tResends:\n'
            + '\t- last: %d requests/s\n'
            + '\t- from: %d requests/s\n'
            + '\t- range: %d requests/s\n'
            + '\tTotal batches: %d (mean age %d ms)\n',
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
            resendRate.last,
            resendRate.from,
            resendRate.range,
            totalBatches,
            meanBatchAge
        )
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
