import { MetricsReport, merge, wait } from '@streamr/utils'
import { scoped, Lifecycle, inject } from 'tsyringe'
import { ConfigInjectionToken, StreamrClientConfig, ProviderAuthConfig } from './Config'
import { DestroySignal } from './DestroySignal'
import { StreamrClientEventEmitter } from './events'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { Publisher } from './publish/Publisher'
import { pOnce } from './utils/promises'

type NormalizedConfig = NonNullable<Required<Exclude<StreamrClientConfig['metrics'], boolean>>>

export const DEFAULTS = {
    periods: [
        {
            duration: 60000,
            streamId: 'streamr.eth/metrics/nodes/firehose/min'
        },
        {
            duration: 3600000,
            streamId: 'streamr.eth/metrics/nodes/firehose/hour'
        },
        {
            duration: 86400000,
            streamId: 'streamr.eth/metrics/nodes/firehose/day'
        }
    ],
    maxPublishDelay: 30000
}

const getNormalizedConfig = (config: Pick<StreamrClientConfig, 'metrics' | 'auth'>): NormalizedConfig => {
    if (config.metrics === true) {
        return DEFAULTS
    } else if (config.metrics === false) {
        return {
            ...DEFAULTS,
            periods: []
        }
    } else if (config.metrics !== undefined) {
        return merge(DEFAULTS, config.metrics)
    } else {
        const isEthereumAuth = (config.auth as ProviderAuthConfig)?.ethereum !== undefined
        return {
            ...DEFAULTS,
            periods: isEthereumAuth ? [] : DEFAULTS.periods
        }
    }
}

@scoped(Lifecycle.ContainerScoped)
export class MetricsPublisher {
    private readonly publisher: Publisher
    private readonly node: NetworkNodeFacade
    private readonly config: NormalizedConfig
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal

    constructor(
        publisher: Publisher,
        node: NetworkNodeFacade,
        @inject(ConfigInjectionToken) config: Pick<StreamrClientConfig, 'metrics' | 'auth'>,
        eventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal
    ) {
        this.publisher = publisher
        this.node = node
        this.config = getNormalizedConfig(config)
        this.eventEmitter = eventEmitter
        this.destroySignal = destroySignal
        const ensureStarted = pOnce(async () => {
            const metricsContext = await this.node.getMetricsContext()
            const nodeId = await this.node.getNodeId()
            this.config.periods.forEach((config) => {
                metricsContext.createReportProducer(
                    async (report: MetricsReport) => {
                        await this.publish(report, config.streamId, nodeId)
                    },
                    config.duration,
                    this.destroySignal.abortSignal
                )
            })
        })
        if (this.config.periods.length > 0) {
            this.eventEmitter.on('messagePublished', () => ensureStarted())
            this.eventEmitter.on('streamPartSubscribed', () => ensureStarted())
        }
    }

    private async publish(report: MetricsReport, streamId: string, nodeId: string): Promise<void> {
        await wait(Math.random() * this.config.maxPublishDelay)
        const message = {
            ...report,
            node: {
                ...report.node,
                id: nodeId
            }
        }
        try {
            await this.publisher.publish(streamId, message, {
                timestamp: report.period.end,
                partitionKey: nodeId
            })
        } catch (e: any) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            console.warn(`Unable to publish metrics: ${e.message}`)
        }
    }
}
