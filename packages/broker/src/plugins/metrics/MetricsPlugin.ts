import { MetricsContext } from 'streamr-network'
import { router as volumeEndpoint } from './VolumeEndpoint'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { StorageNodeRegistryItem } from '../../config'
import { VolumeLogger } from './VolumeLogger'
import { StreamrClient } from 'streamr-client'
import { Schema } from 'ajv'

export interface MetricsPluginConfig {
    consoleLogIntervalInSeconds: number
    legacyMetricsStreamId: string | null
    clientWsUrl?: string
    clientHttpUrl?: string
    perNodeMetrics: {
        enabled: boolean
        intervals: {
            sec: number,
            min: number,
            hour: number,
            day: number
        } | null
        storageNode: string
    } | null
}

export class MetricsPlugin extends Plugin<MetricsPluginConfig> {
    private readonly volumeLogger: VolumeLogger

    constructor(options: PluginOptions) {
        super(options)
        this.volumeLogger = createVolumeLogger(
            this.brokerConfig.ethereumPrivateKey,
            this.pluginConfig,
            this.metricsContext,
            this.nodeId,
            this.storageNodeRegistry.getStorageNodes()
        )
    }

    async start(): Promise<unknown> {
        if (this.isHttpServerEnabled()) {
            this.addHttpServerRouter(volumeEndpoint(this.metricsContext))
        }
        return this.volumeLogger.start()
    }

    async stop(): Promise<unknown> {
        return this.volumeLogger.close()
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

const createVolumeLogger = (
    ethereumPrivateKey: string,
    config: MetricsPluginConfig,
    metricsContext: MetricsContext,
    brokerAddress: string,
    storageNodes: StorageNodeRegistryItem[]
): VolumeLogger => {
    const legacyStreamId = config.legacyMetricsStreamId ?? undefined
    let client: StreamrClient | undefined
    if (config.legacyMetricsStreamId || (config.perNodeMetrics && config.perNodeMetrics.enabled)) {
        const targetStorageNode = config.perNodeMetrics!.storageNode
        const storageNodeRegistryItem = storageNodes.find((n) => n.address === targetStorageNode)
        if (storageNodeRegistryItem === undefined) {
            throw new Error(`Value ${storageNodeRegistryItem} (config.reporting.perNodeMetrics.storageNode) not ` +
                'present in config.storageNodeRegistry')
        }
        client = new StreamrClient({
            auth: {
                privateKey: ethereumPrivateKey,
            },
            url: config.clientWsUrl ?? undefined,
            restUrl: config.clientHttpUrl ?? undefined,
            storageNode: storageNodeRegistryItem
        })
    }

    let reportingIntervals
    let storageNodeAddress
    if (config.perNodeMetrics && config.perNodeMetrics.intervals) {
        reportingIntervals = config.perNodeMetrics.intervals
        storageNodeAddress = config.perNodeMetrics.storageNode
    }

    return new VolumeLogger(
        config.consoleLogIntervalInSeconds,
        metricsContext,
        client,
        legacyStreamId,
        brokerAddress,
        reportingIntervals,
        storageNodeAddress
    )
}
