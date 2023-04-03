import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MinerPluginConfig {}

export class MinerPlugin extends Plugin<MinerPluginConfig> {
    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
