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
        let storageReadCountPerSecond = 0
        let storageWriteCountPerSecond = 0
        let storageReadKbPerSecond = 0
        let storageWriteKbPerSecond = 0
        let resendRate = {
            last: 0,
            from: 0,
            range: 0
        }
        if (report['broker/cassandra'] !== undefined) {
            storageReadCountPerSecond = report['broker/cassandra'].readCount
            storageWriteCountPerSecond = report['broker/cassandra'].writeCount
            storageReadKbPerSecond = report['broker/cassandra'].readBytes / 1000
            storageWriteKbPerSecond = report['broker/cassandra'].writeBytes / 1000
        }

        const networkConnectionCount = report.WebRtcEndpoint.connections
        const networkInPerSecond = report.WebRtcEndpoint.msgInSpeed
        const networkOutPerSecond = report.WebRtcEndpoint.msgOutSpeed
        const networkKbInPerSecond = report.WebRtcEndpoint.inSpeed / 1000
        const networkKbOutPerSecond = report.WebRtcEndpoint.outSpeed / 1000

        const storageQueryMetrics = report['broker/storage/query']
        if (storageQueryMetrics !== undefined) {
            resendRate = {
                last: storageQueryMetrics.lastRequests,
                from: storageQueryMetrics.fromRequests,
                range: storageQueryMetrics.rangeRequests
            }
        }

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
            networkConnectionCount,
            networkInPerSecond,
            networkKbInPerSecond,
            networkOutPerSecond,
            networkKbOutPerSecond,
            storageReadCountPerSecond,
            storageReadKbPerSecond,
            storageWriteCountPerSecond,
            storageWriteKbPerSecond,
            resendRate.last,
            resendRate.from,
            resendRate.range,
        )
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
