import { StreamOperation, StreamrClient } from "streamr-client"
import { MetricsContext } from 'streamr-network'

import { getLogger } from './helpers/logger'

const logger = getLogger('streamr:StreamMetrics')

const throttledAvg = (avg: number, avgInterval: number) => {
    return (0.8 * avg) + (0.2 * avgInterval)
}

class StoppedError extends Error {
    code: string
    constructor(errorText: string) {
        super(errorText)
        this.code = 'StoppedError'
        Error.captureStackTrace(this, StoppedError)
    }
}

export type StreamMetricsOptions = {
    client: StreamrClient, 
    metricsContext: MetricsContext, 
    brokerAddress: string,
    interval: 'sec' | 'min' | 'hour' | 'day', // sec/min/hour/day
    reportMiliseconds: number, // used to override default in tests,
    storageNodeAddress: string
}

export class StreamMetrics {
    private readonly client: StreamrClient
    private readonly metricsContext: MetricsContext
    private readonly brokerAddress: string
    private readonly interval: 'sec' | 'min' | 'hour' | 'day'
    private readonly reportMiliseconds: number
    private readonly storageNodeAddress: string

    sourcePath?: string
    private readonly sourceInterval?: number
    sourceStreamId?: string
    targetStreamId?: string
    readonly path: string
    private readonly report: any
    private metricsReportTimeout?: NodeJS.Timeout
    private stopped = false

    constructor(options: StreamMetricsOptions) {
        this.path = '/streamr/node/metrics/' + options.interval

        this.client = options.client
        this.metricsContext = options.metricsContext
        this.brokerAddress = options.brokerAddress
        this.interval = options.interval
        this.storageNodeAddress = options.storageNodeAddress

        switch (this.interval) {
            case 'sec':
                this.reportMiliseconds = options.reportMiliseconds || 1000
                break
            case 'min':
                this.sourcePath = '/streamr/node/metrics/sec'
                this.sourceInterval = 60
                this.reportMiliseconds = options.reportMiliseconds || 60 * 1000
                break
            case 'hour':
                this.sourcePath = '/streamr/node/metrics/min'
                this.sourceInterval = 60
                this.reportMiliseconds = options.reportMiliseconds || 60 * 60 * 1000

                break
            case 'day':
                this.sourcePath = '/streamr/node/metrics/hour'
                this.sourceInterval = 24
                this.reportMiliseconds = options.reportMiliseconds || 24 * 60 * 60 * 1000
                break
            default:
                throw new Error('Unrecognized interval string, should be sec/min/hour/day')
        }

        this.report = {
            peerName: options.brokerAddress,
            peerId: options.brokerAddress,
            broker: {
                messagesToNetworkPerSec: 0,
                bytesToNetworkPerSec: 0,
                messagesFromNetworkPerSec: 0,
                bytesFromNetworkPerSec: 0,
            },
            network: {
                avgLatencyMs: 0,
                bytesToPeersPerSec: 0,
                bytesFromPeersPerSec: 0,
                connections: 0,
            },
            storage: {
                bytesWrittenPerSec: 0,
                bytesReadPerSec: 0,
            },

            startTime: 0,
            currentTime: 0,
            timestamp: 0
        }

        logger.info(`Started StreamMetrics for interval ${this.interval} running every ${this.reportMiliseconds} ms`)
    }

    async runReport(): Promise<void> {
        try {
            const metricsReport = await this.metricsContext.report(true)
            if (this.stopped) {
                return
            }
            this.report.peerName = metricsReport.peerId
            this.report.peerId = /*metricsReport.peerName||*/ metricsReport.peerId

            if (this.interval === 'sec') {
                if (this.report.timestamp === 0) { // first iteration, assign values
                    this.resetReport()
                    this.report.broker.messagesToNetworkPerSec = (metricsReport.metrics['broker/publisher'].messages as any).rate
                    this.report.broker.bytesToNetworkPerSec = (metricsReport.metrics['broker/publisher'].bytes as any).rate
                    this.report.broker.messagesFromNetworkPerSec = 0
                    this.report.broker.bytesFromNetworkPerSec = 0
                    this.report.network.avgLatencyMs = metricsReport.metrics.node.latency as number || 0
                    this.report.network.bytesToPeersPerSec = (metricsReport.metrics.WebRtcEndpoint.outSpeed as any).rate || 0
                    this.report.network.bytesFromPeersPerSec = (metricsReport.metrics.WebRtcEndpoint.inSpeed as any).rate || 0
                    this.report.network.connections = metricsReport.metrics.WebRtcEndpoint.connections || 0
                    this.report.storage.bytesWrittenPerSec = (metricsReport.metrics['broker/cassandra']) ? metricsReport.metrics['broker/cassandra'].writeBytes : 0
                    this.report.storage.bytesReadPerSec = (metricsReport.metrics['broker/cassandra']) ? metricsReport.metrics['broker/cassandra'].readBytes : 0
                    this.report.startTime = metricsReport.startTime
                    this.report.currentTime = metricsReport.currentTime
                    this.report.timestamp = metricsReport.currentTime
                } else { // calculate averaged values
                    this.report.broker.messagesToNetworkPerSec = throttledAvg(this.report.broker.messagesToNetworkPerSec, (metricsReport.metrics['broker/publisher'].messages as any).rate)
                    this.report.broker.bytesToNetworkPerSec = throttledAvg(this.report.broker.bytesToNetworkPerSec, (metricsReport.metrics['broker/publisher'].bytes as any).rate)
                    this.report.network.avgLatencyMs = throttledAvg(this.report.network.avgLatencyMs, metricsReport.metrics.node.latency as number)
                    this.report.network.bytesToPeersPerSec = throttledAvg(this.report.network.bytesToPeersPerSec, (metricsReport.metrics.WebRtcEndpoint.outSpeed as any).rate || 0)
                    this.report.network.bytesFromPeersPerSec = throttledAvg(this.report.network.bytesFromPeersPerSec, (metricsReport.metrics.WebRtcEndpoint.inSpeed as any).rate || 0)
                    this.report.network.connections = throttledAvg(this.report.network.connections, (metricsReport.metrics.WebRtcEndpoint.connections as any).rate || 0)

                    if (metricsReport.metrics['broker/cassandra']) {
                        this.report.storage.bytesWrittenPerSec = throttledAvg(this.report.storage.bytesWrittenPerSec, (metricsReport.metrics['broker/cassandra']) ? (metricsReport.metrics['broker/cassandra'].writeBytes as any).rate: 0)
                        this.report.storage.bytesReadPerSec = throttledAvg(this.report.storage.bytesReadPerSec, (metricsReport.metrics['broker/cassandra']) ? (metricsReport.metrics['broker/cassandra'].readBytes as any).rate : 0)
                    }

                    this.report.currentTime = metricsReport.currentTime
                    this.report.timestamp = metricsReport.currentTime
                }

                await this.publishReport()
            } else {
                if (!this.sourceStreamId){
                    throw new Error(`Cannot report ${this.interval} without [sourceStreamId]`)
                }

                if (!this.targetStreamId){
                    throw new Error(`Cannot report ${this.interval} without [targetStreamId]`)
                }
                const now = Date.now()
                const messages: any[] = await this.getResend(this.sourceStreamId, this.sourceInterval)

                if (messages.length === 0) {
                    this.resetReport()
                    await this.publishReport()
                } else {
                    const targetMessages: any[] = await this.getResend(this.targetStreamId, 1)
                    if (targetMessages.length > 0 && (targetMessages[0].timestamp + this.reportMiliseconds - now) < 0) {
                        this.resetReport()
                        for (let i = 0; i < messages.length; i++) {
                            this.report.broker.messagesToNetworkPerSec += messages[i].broker.messagesToNetworkPerSec
                            this.report.broker.bytesToNetworkPerSec += messages[i].broker.bytesToNetworkPerSec
                            this.report.broker.messagesFromNetworkPerSec += messages[i].broker.messagesFromNetworkPerSec
                            this.report.broker.bytesFromNetworkPerSec += messages[i].broker.bytesFromNetworkPerSec

                            this.report.network.avgLatencyMs += messages[i].network.avgLatencyMs
                            this.report.network.bytesToPeersPerSec += messages[i].network.bytesToPeersPerSec
                            this.report.network.bytesFromPeersPerSec += messages[i].network.bytesFromPeersPerSec
                            this.report.network.connections += messages[i].network.connections

                            if (metricsReport.metrics['broker/cassandra']) {
                                this.report.storage.bytesWrittenPerSec += messages[i].storage.bytesWrittenPerSec
                                this.report.storage.bytesReadPerSec += messages[i].storage.bytesReadPerSec
                            }

                        }

                        this.report.broker.messagesToNetworkPerSec /= messages.length
                        this.report.broker.bytesToNetworkPerSec /= messages.length
                        this.report.broker.messagesFromNetworkPerSec /= messages.length
                        this.report.broker.bytesFromNetworkPerSec /= messages.length
                        this.report.network.avgLatencyMs /= messages.length
                        this.report.network.bytesToPeersPerSec /= messages.length
                        this.report.network.bytesFromPeersPerSec /= messages.length
                        this.report.network.connections /= messages.length

                        if (metricsReport.metrics['broker/cassandra']) {
                            this.report.storage.bytesWrittenPerSec /= messages.length
                            this.report.storage.bytesReadPerSec /= messages.length
                        }

                        await this.publishReport()
                    }
                }
            }
        } catch (e) {
            if (e.code !== 'StoppedError') {
                logger.warn(e)
            }
        }

        if (!this.stopped) {
            this.metricsReportTimeout = setTimeout(async () => {
                await this.runReport()
            }, this.reportMiliseconds)
        }
    }

    stop(): void {
        this.stopped = true
        if (this.metricsReportTimeout){
            clearTimeout(this.metricsReportTimeout)
        }
        logger.info(`Stopped StreamMetrics for ${this.interval}`)
    }

    async createMetricsStream(path: string): Promise<string> {
        const metricsStream = await this.client.getOrCreateStream({
            id: this.brokerAddress + path
        })
        // TODO: pretify this error handler
        // https://linear.app/streamr/issue/BACK-155/assign-a-stream-to-a-storage-node-when-it-has-already-been-assigned
        try {
            await metricsStream.addToStorageNode(this.storageNodeAddress)
        } catch (e) {
            if (!e.body) { throw e }

            let parsedBody
            try {
                parsedBody = JSON.parse(e.body)
            } catch (jsonError) {
                throw e // original error, not parsing one
            }

            // expected error when re-adding storage node
            if (parsedBody.code !== 'DUPLICATE_NOT_ALLOWED') {
                throw e
            }
        }
        await metricsStream.grantPermission('stream_get' as StreamOperation, undefined)
        await metricsStream.grantPermission('stream_subscribe' as StreamOperation, undefined)
        return metricsStream.id
    }

    private async publishReport(): Promise<unknown> {
        if (!this.stopped && this.targetStreamId) {
            logger.info(`publishing report for ${this.report.peerId} to stream ${this.targetStreamId}`)
            return this.client.publish(this.targetStreamId, this.report)
        }
        return false
    }

    private async getResend(
        stream: string,
        last= 1,
        timeout = 10 * 1000
    ): Promise<Array<Record<string, unknown>>> {
        return new Promise((resolve, reject) => {
            if (this.stopped) {
                return reject(new StoppedError('StreamMetrics stopped'))
            }

            const startTimeout = () => {
                return setTimeout(() => {
                    reject(new Error('StreamMetrics timed out'))
                }, timeout)
            }

            let timeoutId = startTimeout()
            const messages: Array<Record<string, unknown>> = []
            return this.client.resend(
                {
                    stream,
                    resend: {
                        last
                    }
                },
                (message) => {
                    messages.push(message)
                    clearTimeout(timeoutId)
                    timeoutId = startTimeout()
                }
            )
                .then((subscription) => {
                    // @ts-ignore subscription type does not property inherit EventEmitter in client codebase
                    subscription.once('resent', () => {
                        resolve(messages)
                    })
                    // @ts-ignore subscription type does not property inherit EventEmitter in client codebase
                    subscription.once('no_resend', () => {
                        resolve(messages)
                    })
                })
                .catch(reject)
        })
    }

    private resetReport() {
        this.report.broker.messagesToNetworkPerSec = 0
        this.report.broker.bytesToNetworkPerSec = 0

        this.report.network.avgLatencyMs = 0
        this.report.network.bytesToPeersPerSec = 0
        this.report.network.bytesFromPeersPerSec = 0
        this.report.network.connections = 0

        if (this.report.storage) {
            this.report.storage.bytesWrittenPerSec = 0
            this.report.storage.bytesReadPerSec = 0
        }
    }
}

export async function startMetrics(options: StreamMetricsOptions): Promise<StreamMetrics> {
    const metrics = new StreamMetrics(options)
    // TODO: move the "createMetricsStream" statements before new StreamMetrics() and pass the created ids
    // to the class via constructor. This allows making fields targetStreamId, path, sourcePath, and sourceStreamId
    // private read-only as well as allows making createMetricsStream a static method of its own.
    metrics.targetStreamId = await metrics.createMetricsStream(metrics.path)

    if (metrics.sourcePath) {
        metrics.sourceStreamId = await metrics.createMetricsStream(metrics.sourcePath)
    }

    metrics.runReport()
    return metrics
}
