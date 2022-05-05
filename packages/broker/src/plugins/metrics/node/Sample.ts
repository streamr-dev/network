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

export class SampleFactory {

    static createSample(report: MetricsReport): Sample {
        const storageMetricsEnabled = report.broker?.plugin?.storage !== undefined
        return {
            node: {
                publishMessagesPerSecond: report.node.publishMessagesPerSecond,
                publishBytesPerSecond: report.node.publishBytesPerSecond,
                latencyAverageMs: report.node?.latencyAverageMs,
                sendBytesPerSecond: report.node.sendBytesPerSecond,
                receiveBytesPerSecond: report.node.receiveBytesPerSecond,
                connectionAverageCount: report.node.connectionAverageCount,
                connectionTotalFailureCount: report.node.connectionTotalFailureCount
            },
            broker: (storageMetricsEnabled) ? {
                plugin: {
                    storage: {
                        readBytesPerSecond: report.broker.plugin.storage.readBytesPerSecond,
                        writeBytesPerSecond: report.broker.plugin.storage.writeBytesPerSecond
                    }
                }
            } : undefined,
            period: report.period
        }
    }
}
