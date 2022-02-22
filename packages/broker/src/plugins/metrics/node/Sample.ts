import _ from 'lodash'
import { MetricsContext } from 'streamr-network'

export interface Period {
    start: number,
    end: number
}

export const PERIOD_LENGTHS = {
    FIVE_SECONDS: 5 * 1000,
    ONE_MINUTE: 60 * 1000,
    ONE_HOUR: 60 * 60 * 1000,
    ONE_DAY: 24 * 60 * 60 * 1000
}

export interface Sample {
    broker: {
        messagesToNetworkPerSec: number
        bytesToNetworkPerSec: number
    },
    network: {
        avgLatencyMs: number
        bytesToPeersPerSec: number
        bytesFromPeersPerSec: number
        connections: number,
        webRtcConnectionFailures: number
    },
    storage?: {
        bytesWrittenPerSec: number
        bytesReadPerSec: number
    }
    period: Period,
}

const CONTEXT_STORAGE = 'broker/cassandra'

const areStorageMetricsAvailable = (metricsContext: MetricsContext): boolean => {
    // TODO add a method to metricsContext to query current metrics
    return (metricsContext as any).metrics[CONTEXT_STORAGE] !== undefined
}

export class SampleFactory {

    static BASIC_METRICS = [
        'broker.messagesToNetworkPerSec',
        'broker.bytesToNetworkPerSec',
        'network.avgLatencyMs',
        'network.bytesToPeersPerSec',
        'network.bytesFromPeersPerSec',
        'network.connections',
        'network.webRtcConnectionFailures'
    ]
    
    static STORAGE_METRICS = [
        'storage.bytesWrittenPerSec',
        'storage.bytesReadPerSec',
    ]

    metricsContext: MetricsContext
    storageMetricsEnabled: boolean

    constructor(metricsContext: MetricsContext) {
        this.metricsContext = metricsContext
        this.storageMetricsEnabled = areStorageMetricsAvailable(metricsContext)
    }

    async createPrimary(period: Period): Promise<Sample> {
        const metricsReport = await this.metricsContext.report(true)
        return {
            broker: {
                messagesToNetworkPerSec: (metricsReport.metrics['node/publish'].count as any).rate as number,
                bytesToNetworkPerSec: (metricsReport.metrics['node/publish'].bytes as any).rate as number,
            },
            network: {
                avgLatencyMs: metricsReport.metrics.node.latency as number,
                bytesToPeersPerSec: (metricsReport.metrics.WebRtcEndpoint.outSpeed as any).rate,
                bytesFromPeersPerSec: (metricsReport.metrics.WebRtcEndpoint.inSpeed as any).rate,
                connections: metricsReport.metrics.WebRtcEndpoint.connections as number,
                webRtcConnectionFailures: (metricsReport.metrics.WebRtcEndpoint.failedConnection as any).last
            },
            storage: (this.storageMetricsEnabled) ? {
                bytesWrittenPerSec: (metricsReport.metrics[CONTEXT_STORAGE].writeBytes as any).rate,
                bytesReadPerSec: (metricsReport.metrics[CONTEXT_STORAGE].readBytes as any).rate,
            } : undefined,
            period
        }
    }

    createAggregated(samples: Sample[], period: Period): Sample {
        const result: Partial<Sample> = {
            period
        }
        const fillAverages = (fields: string[]) => {
            fields.forEach((field) => {
                const fieldValues = samples.map((data) => _.get(data, field))
                _.set(result, field, _.mean(fieldValues))
            })
        }
        fillAverages(SampleFactory.BASIC_METRICS)
        if (this.storageMetricsEnabled) {
            fillAverages(SampleFactory.STORAGE_METRICS)
        }
        return result as Sample
    }
}
