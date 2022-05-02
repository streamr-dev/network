import { Schema } from 'ajv'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Logger, MetricsReport } from 'streamr-network'

const logger = new Logger(module)

function formatNumber(n: number) {
    return n < 10 ? n.toFixed(1) : String(Math.round(n))
}

export interface ConsoleMetricsPluginConfig {
    interval: number
}

export class ConsoleMetricsPlugin extends Plugin<ConsoleMetricsPluginConfig> {

    private producer?: { stop: () => void}

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        const metricsContext = (await (this.streamrClient!.getNode())).getMetricsContext()
        this.producer = metricsContext.createReportProducer((report: MetricsReport) => {
            this.printReport(report)
        }, this.pluginConfig.interval * 1000, formatNumber)
    }
    
    async stop(): Promise<void> {
        this.producer?.stop()
    }
        
    printReport(report: MetricsReport): void {
        let storageReadMessagesPerSecond = 0
        let storageWriteMessagesPerSecond = 0
        let storageReadKilobytesPerSecond = 0
        let storageWriteKilobytesPerSecond = 0
        let resendRate = {
            last: 0,
            from: 0,
            range: 0
        }
        const storageMetrics = report.broker?.plugin?.storage
        if (storageMetrics !== undefined) {
            storageReadMessagesPerSecond = storageMetrics.readMessagesPerSecond
            storageWriteMessagesPerSecond = storageMetrics.writeMessagesPerSecond
            storageReadKilobytesPerSecond = storageMetrics.readBytesPerSecond / 1000
            storageWriteKilobytesPerSecond = storageMetrics.writeBytesPerSecond / 1000
            resendRate = {
                last: storageMetrics.resendLastQueriesPerSecond,
                from: storageMetrics.resendFromQueriesPerSecond,
                range: storageMetrics.resendRangeQueriesPerSecond
            }    
        }

        const connectionAverageCount = report.node.connectionAverageCount
        const receiveMessagesPerSecond = report.node.receiveMessagesPerSecond
        const sendMessagesPerSecond = report.node.sendMessagesPerSecond
        const receiveKilobytesPerSecond = report.node.receiveBytesPerSecond / 1000
        const sendKilobytesPerSecond = report.node.sendBytesPerSecond / 1000

        logger.info(
            'Report\n'
            + '\tNetwork connections: %s\n'
            + '\tNetwork in: %s events/s, %s kb/s\n'
            + '\tNetwork out: %s events/s, %s kb/s\n'
            + '\tStorage read: %s events/s, %s kb/s\n'
            + '\tStorage write: %s events/s, %s kb/s\n'
            + '\tResends:\n'
            + '\t- last: %s requests/s\n'
            + '\t- from: %s requests/s\n'
            + '\t- range: %s requests/s\n',
            connectionAverageCount,
            receiveMessagesPerSecond,
            receiveKilobytesPerSecond,
            sendMessagesPerSecond,
            sendKilobytesPerSecond,
            storageReadMessagesPerSecond,
            storageReadKilobytesPerSecond,
            storageWriteMessagesPerSecond,
            storageWriteKilobytesPerSecond,
            resendRate.last,
            resendRate.from,
            resendRate.range,
        )
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
