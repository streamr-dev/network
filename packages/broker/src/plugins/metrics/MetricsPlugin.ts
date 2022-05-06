import { Schema } from 'ajv'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { NodeMetrics, PeriodConfig } from './node/NodeMetrics'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

export interface MetricsPluginConfig {
    periods: PeriodConfig[]
}

export class MetricsPlugin extends Plugin<MetricsPluginConfig> {
    private nodeMetrics?: NodeMetrics

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        const metricsContext = (await (this.streamrClient!.getNode())).getMetricsContext()
        this.nodeMetrics = new NodeMetrics(
            metricsContext,
            this.streamrClient!,
            this.pluginConfig.periods
        )
        try {
            await this.nodeMetrics.start()
        } catch (e) {
            // TODO remove this catch block after testnet is completed (it is ok to that the plugin throws an error and Broker doesn't start)
            logger.warn(`Unable to start MetricsPlugin: ${e.message}`)
        }
    }

    async stop(): Promise<void> {
        if (this.nodeMetrics !== undefined) {
            await this.nodeMetrics.stop()
        }
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
