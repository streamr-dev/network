import StreamrClient from 'streamr-client'
import { Logger, MetricsContext, MetricsReport } from 'streamr-network'

const logger = new Logger(module)

const PERIODS = {
    FIVE_SECONDS: {
        duration: 5 * 1000,
        streamIdSuffix: 'sec'
    },
    ONE_MINUTE: {
        duration: 60 * 1000,
        streamIdSuffix: 'min'
    },
    ONE_HOUR: {
        duration: 60 * 60 * 1000,
        streamIdSuffix: 'hour'
    },
    ONE_DAY: {
        duration: 24 * 60 * 60 * 1000,
        streamIdSuffix: 'day'
    }
}

export class NodeMetrics {

    private readonly client: StreamrClient
    private readonly streamIdPrefix: string
    private metricsContext: MetricsContext
    private producers: { stop: () => void }[] = []

    constructor(metricsContext: MetricsContext, client: StreamrClient, streamIdPrefix: string) {
        this.metricsContext = metricsContext
        this.client = client
        this.streamIdPrefix = streamIdPrefix
    }

    private async publish(report: MetricsReport, streamIdSuffix: string): Promise<void> {
        const streamId = `${this.streamIdPrefix}${streamIdSuffix}`
        const nodeId = (await this.client.getNode()).getNodeId()
        const partitionKey = nodeId.toLowerCase()
        try {
            await this.client.publish(streamId, report, undefined, partitionKey)
        } catch (e: any) {
            logger.warn(`Unable to publish NodeMetrics: ${e.message}`)
        }
    }

    async start(): Promise<void> {
        this.producers = Object.values(PERIODS).map((period) => {
            return this.metricsContext.createReportProducer(async (report: MetricsReport) => {
                await this.publish(report, period.streamIdSuffix)
            }, period.duration)
        })
    }

    async stop(): Promise<void> {
        this.producers.forEach((producer) => producer.stop())
    }
}
