import StreamrClient from 'streamr-client'
import { Logger, MetricsContext, MetricsReport } from 'streamr-network'

const logger = new Logger(module)

export interface PeriodConfig {
    streamId: string,
    duration: number
}

export class NodeMetrics {

    private readonly client: StreamrClient
    private metricsContext: MetricsContext
    private reportConfigs: PeriodConfig[]
    private producers: { stop: () => void }[] = []

    constructor(metricsContext: MetricsContext, client: StreamrClient, periodConfigs: PeriodConfig[]) {
        this.metricsContext = metricsContext
        this.client = client
        this.reportConfigs = periodConfigs
    }

    private async publish(report: MetricsReport, streamId: string): Promise<void> {
        const nodeId = (await this.client.getNode()).getNodeId()
        const partitionKey = nodeId.toLowerCase()
        try {
            await this.client.publish(streamId, report, undefined, partitionKey)
        } catch (e: any) {
            logger.warn(`Unable to publish NodeMetrics: ${e.message}`)
        }
    }

    async start(): Promise<void> {
        this.producers = this.reportConfigs.map((config) => {
            return this.metricsContext.createReportProducer(async (report: MetricsReport) => {
                await this.publish(report, config.streamId)
            }, config.duration)
        })
    }

    async stop(): Promise<void> {
        this.producers.forEach((producer) => producer.stop())
    }
}
