import { scoped, Lifecycle, inject } from 'tsyringe'
import { StreamrClientEventEmitter } from './events'
import { DestroySignal } from './DestroySignal'
import { MetricsReport } from 'streamr-network'
import { NetworkNodeFacade, getEthereumAddressFromNodeId } from './NetworkNodeFacade'
import { Publisher } from './publish/Publisher'
import { ConfigInjectionToken, MetricsConfig, STREAM_CLIENT_DEFAULTS, StrictStreamrClientConfig } from './Config'
import { wait } from '@streamr/utils'

const getNormalizedConfig = (config: MetricsConfig): Exclude<MetricsConfig, boolean> => {
    const defaults = STREAM_CLIENT_DEFAULTS.metrics as Exclude<MetricsConfig, boolean>
    if (config === true) {
        return defaults
    } else if (config === false) {
        return {
            ...defaults,
            periods: []
        }
    } else {
        return config
    }
}

@scoped(Lifecycle.ContainerScoped)
export class MetricsPublisher {

    private publisher: Publisher
    private node: NetworkNodeFacade
    private eventEmitter: StreamrClientEventEmitter
    private destroySignal: DestroySignal
    private config: Exclude<MetricsConfig, boolean>
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
        this.config = getNormalizedConfig(rootConfig.metrics)
        if (this.config.periods.length > 0) {
            this.eventEmitter.on('publish', () => this.ensureStarted())
            this.eventEmitter.on('subscribe', () => this.ensureStarted())
            this.destroySignal.onDestroy.listen(() => this.stop())
        }
    }

    private async ensureStarted(): Promise<void> {
        if (this.producers.length === 0) {
            const node = await this.node.getNode()
            const metricsContext = node.getMetricsContext()
            const partitionKey = getEthereumAddressFromNodeId(node.getNodeId()).toLowerCase()
            this.producers = this.config.periods.map((config) => {
                return metricsContext.createReportProducer(async (report: MetricsReport) => {
                    await this.publish(report, config.streamId, partitionKey)
                }, config.duration)
            })    
        }
    }

    private async publish(report: MetricsReport, streamId: string, partitionKey: string): Promise<void> {
        await wait(Math.random() * this.config.maxPublishDelay)
        try {
            await this.publisher.publish(streamId, report, {
                timestamp: report.period.end,
                partitionKey
            })
        } catch (e: any) {
            console.warn(`Unable to publish metrics: ${e.message}`)
        }
    }

    stop(): void {
        this.producers.forEach((producer) => producer.stop())
        this.producers = []
    }
}
