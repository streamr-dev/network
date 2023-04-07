import { createEndpoint } from './publishEndpoint'
import { ApiPluginConfig, Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'

export class HttpPlugin extends Plugin<ApiPluginConfig> {
    async start(): Promise<void> {
        this.addHttpServerEndpoint(createEndpoint(this.streamrClient!))
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
