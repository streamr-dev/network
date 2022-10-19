import { scoped, Lifecycle, inject } from 'tsyringe'
import { StreamrClientEventEmitter } from './events'
import { DestroySignal } from './DestroySignal'
import { MetricsReport } from 'streamr-network'
import { NetworkNodeFacade, getEthereumAddressFromNodeId } from './NetworkNodeFacade'
import { Publisher } from './publish/Publisher'
import { ConfigInjectionToken, MetricsPeriodConfig, STREAM_CLIENT_DEFAULTS, StrictStreamrClientConfig } from './Config'
import { pOnce } from './utils/promises'

const getPeriodConfig = (rootConfig: StrictStreamrClientConfig): MetricsPeriodConfig[] => {
    switch (rootConfig.metrics) {
        case true:
            return (STREAM_CLIENT_DEFAULTS.metrics as { periods: MetricsPeriodConfig[] }).periods
        case false:
            return []
        default:
            return rootConfig.metrics.periods
    }
}

@scoped(Lifecycle.ContainerScoped)
export class MetricsPublisher {

    private publisher: Publisher
    private node: NetworkNodeFacade
    private eventEmitter: StreamrClientEventEmitter
    private destroySignal: DestroySignal
    private periodConfigs: MetricsPeriodConfig[]
    private producers: { stop: () => void }[] = []

    constructor(
        @inject(Publisher) publisher: Publisher,
        @inject(NetworkNodeFacade) node: NetworkNodeFacade,
        @inject(StreamrClientEventEmitter) eventEmitter: StreamrClientEventEmitter,
        @inject(DestroySignal) destroySignal: DestroySignal,
        @inject(ConfigInjectionToken.Root) rootConfig: StrictStreamrClientConfig
    ) {
        this.publisher = publisher
        this.node = node
        this.eventEmitter = eventEmitter
        this.destroySignal = destroySignal
        this.periodConfigs = getPeriodConfig(rootConfig)
        const ensureStarted = pOnce(async () => {
            const node = await this.node.getNode()
            const metricsContext = node.getMetricsContext()
            const partitionKey = getEthereumAddressFromNodeId(node.getNodeId()).toLowerCase()
            this.producers = this.periodConfigs.map((config) => {
                return metricsContext.createReportProducer(async (report: MetricsReport) => {
                    await this.publish(report, config.streamId, partitionKey)
                }, config.duration)
            })
        })
        if (this.periodConfigs.length > 0) {
            this.eventEmitter.on('publish', () => ensureStarted())
            this.eventEmitter.on('subscribe', () => ensureStarted())
            this.destroySignal.onDestroy.listen(() => this.destroy())
        }
    }

    private async publish(report: MetricsReport, streamId: string, partitionKey: string): Promise<void> {
        try {
            await this.publisher.publish(streamId, report, {
                partitionKey
            })
        } catch (e: any) {
            console.warn(`Unable to publish metrics: ${e.message}`)
        }
    }

    private destroy(): void {
        this.producers.forEach((producer) => producer.stop())
    }
}
