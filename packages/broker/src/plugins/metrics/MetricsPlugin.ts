import { Schema } from 'ajv'
import { router as volumeEndpoint } from './VolumeEndpoint'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { VolumeLogger } from './VolumeLogger'
import { NodeMetrics } from './node/NodeMetrics'
import { MetricsPublisher } from './node/MetricsPublisher'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

export interface MetricsPluginConfig {
    consoleAndPM2IntervalInSeconds: number
    nodeMetrics: {
        storageNode: string
        firehoseStreamIdHead: string
    } | null
}

export class MetricsPlugin extends Plugin<MetricsPluginConfig> {
    private volumeLogger?: VolumeLogger
    private nodeMetrics?: NodeMetrics

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        const metricsContext = (await (this.streamrClient!.getNode())).getMetricsContext()
        this.volumeLogger = new VolumeLogger(
            this.pluginConfig.consoleAndPM2IntervalInSeconds,
            metricsContext,
        )

        if (this.pluginConfig.nodeMetrics !== null) {
            const metricsPublisher = new MetricsPublisher(
                this.nodeId,
                this.streamrClient!,
                this.pluginConfig.nodeMetrics.storageNode,
                this.pluginConfig.nodeMetrics.firehoseStreamIdHead
            )
            this.nodeMetrics = new NodeMetrics(metricsContext, metricsPublisher)
        }
        try {
            this.addHttpServerRouter(volumeEndpoint(metricsContext))
            if (this.nodeMetrics !== undefined) {
                await this.nodeMetrics.start()
            }
            await this.volumeLogger.start()
        } catch (e) {
            // TODO remove this catch block after testnet is completed (it is ok to that the plugin throws an error and Broker doesn't start)
            logger.warn(`Unable to start MetricsPlugin: ${e.message}`)
        }
    }

    async stop(): Promise<void> {
        if (this.nodeMetrics !== undefined) {
            await this.nodeMetrics.stop()
        }
        await this.volumeLogger!.stop()
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
