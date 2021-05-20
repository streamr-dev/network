import { MetricsContext } from 'streamr-network'
import io from '@pm2/io'
import Gauge from '@pm2/io/build/main/utils/metrics/gauge'
import { StreamrClient } from "streamr-client"
import { Logger } from 'streamr-network'
import { startMetrics, StreamMetrics } from './StreamMetrics'
import { Config } from './config'

const logger = new Logger(module)

function formatNumber(n: number) {
    return n < 10 ? n.toFixed(1) : Math.round(n)
}

type PerStreamReportingIntervals = NonNullable<Config['reporting']['perNodeMetrics']>['intervals']

export class VolumeLogger {
    metricsContext: MetricsContext
    client?: StreamrClient
    legacyStreamId?: string
    brokerConnectionCountMetric: Gauge
    eventsInPerSecondMetric: Gauge
    eventsOutPerSecondMetric: Gauge
    kbInPerSecondMetric: Gauge
    kbOutPerSecondMetric: Gauge
    storageReadPerSecondMetric: Gauge
    storageWritePerSecondMetric: Gauge
    storageReadKbPerSecondMetric: Gauge
    storageWriteKbPerSecondMetric: Gauge
    totalBufferSizeMetric: Gauge
    ongoingResendsMetric: Gauge
    meanResendAgeMetric: Gauge
    totalBatchesMetric: Gauge
    meanBatchAge: Gauge
    messageQueueSizeMetric: Gauge
    timeout?: NodeJS.Timeout
    brokerAddress?: string
    perStreamReportingIntervals?: PerStreamReportingIntervals
    storageNodeAddress?: string
    reportingIntervalSeconds: number
    perStreamMetrics?: { [interval: string]: StreamMetrics }

    constructor(
        reportingIntervalSeconds = 60,
        metricsContext: MetricsContext,
        client: StreamrClient | undefined = undefined,
        legacyStreamId?: string,
        brokerAddress?: string,
        perStreamReportingIntervals?: PerStreamReportingIntervals,
        storageNodeAddress?: string
    ) {
        this.reportingIntervalSeconds = reportingIntervalSeconds
        this.metricsContext = metricsContext
        this.client = client
        this.legacyStreamId = legacyStreamId
        this.brokerAddress = brokerAddress
        this.perStreamReportingIntervals = perStreamReportingIntervals
        this.storageNodeAddress = storageNodeAddress

        this.brokerConnectionCountMetric = io.metric({
            name: 'brokerConnectionCountMetric'
        })
        this.eventsInPerSecondMetric = io.metric({
            name: 'eventsIn/sec'
        })
        this.eventsOutPerSecondMetric = io.metric({
            name: 'eventsOut/sec'
        })
        this.kbInPerSecondMetric = io.metric({
            name: 'kbIn/sec'
        })
        this.kbOutPerSecondMetric = io.metric({
            name: 'kbOut/sec'
        })
        this.storageReadPerSecondMetric = io.metric({
            name: 'storageRead/sec'
        })
        this.storageWritePerSecondMetric = io.metric({
            name: 'storageWrite/sec'
        })
        this.storageReadKbPerSecondMetric = io.metric({
            name: 'storageReadKb/sec'
        })
        this.storageWriteKbPerSecondMetric = io.metric({
            name: 'storageWriteKb/sec'
        })
        this.totalBufferSizeMetric = io.metric({
            name: 'totalBufferSize'
        })
        this.ongoingResendsMetric = io.metric({
            name: 'ongoingResends'
        })
        this.meanResendAgeMetric = io.metric({
            name: 'meanResendAge'
        })
        this.totalBatchesMetric = io.metric({
            name: 'totalBatches'
        })
        this.meanBatchAge = io.metric({
            name: 'meanBatchAge'
        })
        this.messageQueueSizeMetric = io.metric({
            name: 'messageQueueSize'
        })
    }

    async start() {
        if (this.client instanceof StreamrClient) {
            await this.initializePerMetricsStream()
        }

        if (this.reportingIntervalSeconds > 0) {
            logger.info('starting legacy metrics reporting interval')
            const reportingIntervalInMs = this.reportingIntervalSeconds * 1000
            const reportFn = async () => {
                try {
                    await this.reportAndReset()
                } catch (e) {
                    logger.warn(`Error reporting metrics ${e}`)
                }
                this.timeout = setTimeout(reportFn, reportingIntervalInMs)
            }
            this.timeout = setTimeout(reportFn, reportingIntervalInMs)
        }
    }

    async initializePerMetricsStream() {
        if (!this.client || !this.brokerAddress || !this.storageNodeAddress) {
            throw new Error('Cannot initialize perStream metrics without valid client, brokerAddress, storageNodeAddress')
        }
        this.perStreamMetrics = {
            sec: await startMetrics({
                client: this.client,
                metricsContext: this.metricsContext,
                brokerAddress: this.brokerAddress,
                interval: 'sec',
                reportMiliseconds: ((this.perStreamReportingIntervals) ? this.perStreamReportingIntervals.sec :0),
                storageNodeAddress: this.storageNodeAddress
            }),
            min: await startMetrics({
                client: this.client,
                metricsContext: this.metricsContext,
                brokerAddress: this.brokerAddress,
                interval: 'min',
                reportMiliseconds: (this.perStreamReportingIntervals) ? this.perStreamReportingIntervals.min : 0,
                storageNodeAddress: this.storageNodeAddress,
            }),
            hour: await startMetrics({
                client: this.client,
                metricsContext: this.metricsContext,
                brokerAddress: this.brokerAddress,
                interval: 'hour',
                reportMiliseconds: (this.perStreamReportingIntervals) ? this.perStreamReportingIntervals.hour : 0,
                storageNodeAddress: this.storageNodeAddress,
            }),
            day: await startMetrics({
                client: this.client,
                metricsContext: this.metricsContext,
                brokerAddress: this.brokerAddress,
                interval: 'day',
                reportMiliseconds: (this.perStreamReportingIntervals) ? this.perStreamReportingIntervals.day : 0,
                storageNodeAddress: this.storageNodeAddress,
            })
        }
    }

    async reportAndReset() {
        const report = await this.metricsContext.report(true)

        // Report metrics to Streamr stream
        if (this.client instanceof StreamrClient && this.legacyStreamId !== undefined) {
            this.client.publish(this.legacyStreamId, report).catch((e) => {
                logger.warn(`failed to publish metrics to ${this.legacyStreamId} because ${e}`)
            })
        }

        // @ts-expect-error
        const inPerSecond = report.metrics['broker/publisher'].messages.rate
        // @ts-expect-error
        const kbInPerSecond = report.metrics['broker/publisher'].bytes.rate / 1000
        // @ts-expect-error
        const outPerSecond = (report.metrics['broker/ws'] ? report.metrics['broker/ws'].outMessages.rate : 0)
            // @ts-expect-error
            + (report.metrics['broker/mqtt'] ? report.metrics['broker/mqtt'].outMessages.rate : 0)
            // @ts-expect-error
            + (report.metrics['broker/http'] ? report.metrics['broker/http'].outMessages.rate : 0)
        // @ts-expect-error
        const kbOutPerSecond = ((report.metrics['broker/ws'] ? report.metrics['broker/ws'].outBytes.rate : 0)
            // @ts-expect-error
            + (report.metrics['broker/mqtt'] ? report.metrics['broker/mqtt'].outBytes.rate : 0)
            // @ts-expect-error
            + (report.metrics['broker/http'] ? report.metrics['broker/http'].outBytes.rate : 0)) / 1000

        let storageReadCountPerSecond = 0
        let storageWriteCountPerSecond = 0
        let storageReadKbPerSecond = 0
        let storageWriteKbPerSecond = 0
        let totalBatches = 0
        let meanBatchAge = 0
        if (report.metrics['broker/cassandra']) {
            // @ts-expect-error
            storageReadCountPerSecond = report.metrics['broker/cassandra'].readCount.rate
            // @ts-expect-error
            storageWriteCountPerSecond = report.metrics['broker/cassandra'].writeCount.rate
            // @ts-expect-error
            storageReadKbPerSecond = report.metrics['broker/cassandra'].readBytes.rate / 1000
            // @ts-expect-error
            storageWriteKbPerSecond = report.metrics['broker/cassandra'].writeBytes.rate / 1000
            // @ts-expect-error
            totalBatches = report.metrics['broker/cassandra'].batchManager.totalBatches
            // @ts-expect-error
            meanBatchAge = report.metrics['broker/cassandra'].batchManager.meanBatchAge
        }

        // @ts-expect-error
        const brokerConnectionCount = (report.metrics['broker/ws'] ? report.metrics['broker/ws'].connections : 0)
            + (report.metrics['broker/mqtt'] ? report.metrics['broker/mqtt'].connections : 0)

        const networkConnectionCount = report.metrics.WebRtcEndpoint.connections
        // @ts-expect-error
        const networkInPerSecond = report.metrics.WebRtcEndpoint.msgInSpeed.rate
        // @ts-expect-error
        const networkOutPerSecond = report.metrics.WebRtcEndpoint.msgOutSpeed.rate
        // @ts-expect-error
        const networkKbInPerSecond = report.metrics.WebRtcEndpoint.inSpeed.rate / 1000
        // @ts-expect-error
        const networkKbOutPerSecond = report.metrics.WebRtcEndpoint.outSpeed.rate / 1000
        const { messageQueueSize } = report.metrics.WebRtcEndpoint

        let ongoingResends = 0
        let resendMeanAge = 0
        let totalBuffer = report.metrics.WebRtcEndpoint.totalWebSocketBuffer as number
        const websocketMetrics = report.metrics['broker/ws']
        if (websocketMetrics !== undefined) {
            ongoingResends = websocketMetrics.numOfOngoingResends as number
            resendMeanAge = websocketMetrics.meanAgeOfOngoingResends as number
            totalBuffer += websocketMetrics.totalWebSocketBuffer as number
        }

        logger.info(
            'Report\n'
            + '\tBroker connections: %d\n'
            + '\tBroker in: %d events/s, %d kb/s\n'
            + '\tBroker out: %d events/s, %d kb/s\n'
            + '\tNetwork connections %d\n'
            + '\tQueued messages: %d\n'
            + '\tNetwork in: %d events/s, %d kb/s\n'
            + '\tNetwork out: %d events/s, %d kb/s\n'
            + '\tStorage read: %d events/s, %d kb/s\n'
            + '\tStorage write: %d events/s, %d kb/s\n'
            + '\tTotal ongoing resends: %d (mean age %d ms)\n'
            + '\tTotal batches: %d (mean age %d ms)\n',
            brokerConnectionCount,
            formatNumber(inPerSecond),
            formatNumber(kbInPerSecond),
            formatNumber(outPerSecond),
            formatNumber(kbOutPerSecond),
            networkConnectionCount,
            messageQueueSize,
            formatNumber(networkInPerSecond),
            formatNumber(networkKbInPerSecond),
            formatNumber(networkOutPerSecond),
            formatNumber(networkKbOutPerSecond),
            formatNumber(storageReadCountPerSecond),
            formatNumber(storageReadKbPerSecond),
            formatNumber(storageWriteCountPerSecond),
            formatNumber(storageWriteKbPerSecond),
            ongoingResends,
            resendMeanAge,
            totalBatches,
            meanBatchAge
        )

        this.eventsInPerSecondMetric.set(inPerSecond)
        this.kbInPerSecondMetric.set(kbInPerSecond)
        this.eventsOutPerSecondMetric.set(outPerSecond)
        this.kbOutPerSecondMetric.set(kbOutPerSecond)
        this.storageReadPerSecondMetric.set(storageReadCountPerSecond)
        this.storageWritePerSecondMetric.set(storageWriteCountPerSecond)
        this.storageReadKbPerSecondMetric.set(storageReadKbPerSecond)
        this.storageWriteKbPerSecondMetric.set(storageWriteKbPerSecond)
        this.brokerConnectionCountMetric.set(brokerConnectionCount)
        this.totalBufferSizeMetric.set(totalBuffer)
        this.ongoingResendsMetric.set(ongoingResends)
        this.meanResendAgeMetric.set(resendMeanAge)
        this.messageQueueSizeMetric.set(messageQueueSize)
        if (report.metrics['broker/cassandra']) {
            this.totalBatchesMetric.set(totalBatches)
            this.meanBatchAge.set(meanBatchAge)
        }
    }

    close() {
        if (this.perStreamMetrics) {
            this.perStreamMetrics.sec.stop()
            this.perStreamMetrics.min.stop()
            this.perStreamMetrics.hour.stop()
            this.perStreamMetrics.day.stop()
        }

        io.destroy()
        clearTimeout(this.timeout!)
        if (this.client) {
            this.client.ensureDisconnected()
        }
    }
}
