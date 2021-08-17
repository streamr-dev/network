import { MetricsContext } from 'streamr-network'
import io from '@pm2/io'
import { StreamrClient } from "streamr-client"
import { startMetrics, StreamMetrics } from './StreamMetrics'
import { MetricsPluginConfig } from './MetricsPlugin'
import { LegacyMetrics } from './LegacyMetrics'

type PerStreamReportingIntervals = NonNullable<MetricsPluginConfig['perNodeMetrics']>['intervals']

export class VolumeLogger {

    metricsContext: MetricsContext
    client?: StreamrClient
    legacyStreamId?: string
    brokerAddress?: string
    perStreamReportingIntervals?: PerStreamReportingIntervals
    storageNodeAddress?: string
    perStreamMetrics?: { [interval: string]: StreamMetrics }
    legacyMetrics?: LegacyMetrics

    constructor(
        reportingIntervalSeconds = 60,
        metricsContext: MetricsContext,
        client: StreamrClient | undefined = undefined,
        legacyStreamId?: string,
        brokerAddress?: string,
        perStreamReportingIntervals?: PerStreamReportingIntervals,
        storageNodeAddress?: string
    ) {
        this.metricsContext = metricsContext
        this.client = client
        this.legacyStreamId = legacyStreamId
        this.brokerAddress = brokerAddress
        this.perStreamReportingIntervals = perStreamReportingIntervals
        this.storageNodeAddress = storageNodeAddress
    
        if (reportingIntervalSeconds > 0) {
            this.legacyMetrics = new LegacyMetrics(reportingIntervalSeconds, metricsContext, legacyStreamId, client)
        }
    }

    async start(): Promise<void> {
        if (this.client instanceof StreamrClient) {
            await this.initializePerMetricsStream()
        }

        if (this.legacyMetrics !== undefined) {
            this.legacyMetrics.start()
        }
    }

    private async initializePerMetricsStream(): Promise<void> {
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

    stop(): void {
        if (this.perStreamMetrics) {
            this.perStreamMetrics.sec.stop()
            this.perStreamMetrics.min.stop()
            this.perStreamMetrics.hour.stop()
            this.perStreamMetrics.day.stop()
        }

        io.destroy()

        if (this.legacyMetrics !== undefined) {
            this.legacyMetrics.stop()
        }

        if (this.client) {
            this.client.ensureDisconnected()
        }
    }
}
