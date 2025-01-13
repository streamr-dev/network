import { Logger, MetricsReport } from '@streamr/utils'
import { Schema } from 'ajv'
import omit from 'lodash/omit'
import { StreamrClient } from '@streamr/sdk'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

const logger = new Logger(module)

function formatNumber(n: number) {
    return n < 10 ? n.toFixed(1) : String(Math.round(n))
}

export interface ConsoleMetricsPluginConfig {
    interval: number
}

export class ConsoleMetricsPlugin extends Plugin<ConsoleMetricsPluginConfig> {
    private readonly abortController = new AbortController()

    async start(streamrClient: StreamrClient): Promise<void> {
        const metricsContext = await streamrClient.getNode().getMetricsContext()
        metricsContext.createReportProducer(
            (report: MetricsReport) => {
                // omit timestamp info as that is printed by the logger
                const data = omit(report, 'period')
                // remove quote chars to improve readability
                const output = JSON.stringify(data, undefined, 4).replace(/"/g, '')
                logger.info(`Report\n${output}`)
            },
            this.pluginConfig.interval * 1000,
            this.abortController.signal,
            formatNumber
        )
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
