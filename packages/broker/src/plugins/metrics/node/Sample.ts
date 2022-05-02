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

const CONTEXT_STORAGE = 'broker.plugin.storage'

export class SampleFactory {

    static createSample(report: MetricsReport): Sample {
        const storageMetricsEnabled = report[CONTEXT_STORAGE] !== undefined
        return {
            node: {
                publishMessagesPerSecond: report.node.publishMessagesPerSecond,
                publishBytesPerSecond: report.node.publishBytesPerSecond,
                latencyAverageMs: report.node?.latencyAverageMs,
                sendBytesPerSecond: report.node.sendBytesPerSecond,
                receiveBytesPerSecond: report.node.receiveMessagesPerSecond,
                connectionAverageCount: report.node.connectionAverageCount,
                connectionTotalFailureCount: report.node.connectionTotalFailureCount
            },
            broker: (storageMetricsEnabled) ? {
                plugin: {
                    storage: {
                        readBytesPerSecond: report[CONTEXT_STORAGE].readBytesPerSecond,
                        writeBytesPerSecond: report[CONTEXT_STORAGE].writeBytesPerSecond
                    }
                }
            } : undefined,
            period: report.period
        }
    }
}
