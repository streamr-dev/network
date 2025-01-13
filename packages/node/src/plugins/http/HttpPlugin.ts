import { createEndpoint } from './publishEndpoint'
import { ApiPluginConfig, Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'
import { StreamrClient } from '@streamr/sdk'

export class HttpPlugin extends Plugin<ApiPluginConfig> {
    async start(streamrClient: StreamrClient): Promise<void> {
        this.addHttpServerEndpoint(createEndpoint(streamrClient))
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
