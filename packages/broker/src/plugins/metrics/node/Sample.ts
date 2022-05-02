import { MetricsReport } from 'streamr-network'

export interface Sample {
    node: {
        publishMessagesPerSecond: number
        publishBytesPerSecond: number
        latencyAverageMs: number
        sendBytesPerSecond: number
        receiveBytesPerSecond: number
        connectionAverageCount: number,
        connectionTotalFailureCount: number
    },
    broker?: {
        plugin: {
            storage: {
                writeBytesPerSecond: number,
                readBytesPerSecond: number
            }
        }
    },
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
            node: {
                publishMessagesPerSecond: report['node/publish'].count,
                publishBytesPerSecond: report['node/publish'].bytes,
                latencyAverageMs: report.node?.latency,
                sendBytesPerSecond: report.WebRtcEndpoint.outSpeed,
                receiveBytesPerSecond: report.WebRtcEndpoint.inSpeed,
                connectionAverageCount: report.WebRtcEndpoint.connections,
                connectionTotalFailureCount: report.WebRtcEndpoint.failedConnection
            },
            broker: (storageMetricsEnabled) ? {
                plugin: {
                    storage: {
                        writeBytesPerSecond: report[CONTEXT_STORAGE].writeBytes,
                        readBytesPerSecond: report[CONTEXT_STORAGE].readBytes
                    }
                }
            } : undefined,
            period: report.period
        }
    }
}
