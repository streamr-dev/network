import { Schema } from 'ajv'
import { StreamrClient } from '@streamr/sdk'
import { ApiPluginConfig, Plugin } from '../../Plugin'
import { getPayloadFormat } from '../../helpers/PayloadFormat'
import { Bridge } from './Bridge'
import { MqttServer } from './MqttServer'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export interface MqttPluginConfig extends ApiPluginConfig {
    port: number
    streamIdDomain?: string
    payloadMetadata: boolean
}

export class MqttPlugin extends Plugin<MqttPluginConfig> {
    private server?: MqttServer

    async start(streamrClient: StreamrClient): Promise<void> {
        this.server = new MqttServer(this.pluginConfig.port, this.getApiAuthentication())
        const bridge = new Bridge(
            streamrClient,
            this.server,
            getPayloadFormat(this.pluginConfig.payloadMetadata),
            this.pluginConfig.streamIdDomain
        )
        this.server.setListener(bridge)
        return this.server.start()
    }

    async stop(): Promise<void> {
        await this.server!.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
