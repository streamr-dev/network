import { scoped, Lifecycle, inject } from 'tsyringe'
import { StreamrClientEventEmitter } from './events'
import { DestroySignal } from './DestroySignal'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { Publisher } from './publish/Publisher'
import { ConfigInjectionToken, StreamrClientConfig, ProviderAuthConfig } from './Config'
import { pOnce } from './utils/promises'
import { MetricsReport, wait } from '@streamr/utils'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { merge } from '@streamr/utils'

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
        const isEthereumAuth = ((config.auth as ProviderAuthConfig)?.ethereum !== undefined)
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
        @inject(AuthenticationInjectionToken) authentication: Authentication,
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
            const node = await this.node.getNode()
            const metricsContext = node.getMetricsContext()
            const partitionKey = (await authentication.getAddress()).toLowerCase()
            this.config.periods.map((config) => {

                return metricsContext.createReportProducer(async (report: MetricsReport) => {
                    await this.publish(report, config.streamId, partitionKey)
                }, config.duration, this.destroySignal.abortSignal)
            })
        })
        if (this.config.periods.length > 0) {
            this.eventEmitter.on('publish', () => ensureStarted())
            this.eventEmitter.on('subscribe', () => ensureStarted())
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
}
