import { MetricsReport } from 'streamr-network'

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
    period: {
        start: number,
        end: number
    }
}

const CONTEXT_STORAGE = 'broker/cassandra'

export class SampleFactory {

    static createSample(report: MetricsReport): Sample {
        const storageMetricsEnabled = report[CONTEXT_STORAGE] !== undefined
        return {
            broker: {
                messagesToNetworkPerSec: report['node/publish'].count,
                bytesToNetworkPerSec: report['node/publish'].bytes,
            },
            network: {
                avgLatencyMs: report.node?.latency,
                bytesToPeersPerSec: report.WebRtcEndpoint.outSpeed,
                bytesFromPeersPerSec: report.WebRtcEndpoint.inSpeed,
                connections: report.WebRtcEndpoint.connections,
                webRtcConnectionFailures: report.WebRtcEndpoint.failedConnection
            },
            storage: (storageMetricsEnabled) ? {
                bytesWrittenPerSec: report[CONTEXT_STORAGE].writeBytes,
                bytesReadPerSec: report[CONTEXT_STORAGE].readBytes
            } : undefined,
            period: report.period
        }
    }
}
