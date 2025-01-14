import { Schema } from 'ajv'
import { StreamrClient } from '@streamr/sdk'
import { Plugin } from '../../Plugin'
import { getPayloadFormat } from '../../helpers/PayloadFormat'
import { WebsocketServer } from './WebsocketServer'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export interface WebsocketPluginConfig {
    port: number
    payloadMetadata: boolean
    pingSendInterval: number
    disconnectTimeout: number
    sslCertificate?: {
        privateKeyFileName: string
        certFileName: string
    }
}

export class WebsocketPlugin extends Plugin<WebsocketPluginConfig> {
    private server?: WebsocketServer

    async start(streamrClient: StreamrClient): Promise<void> {
        this.server = new WebsocketServer(
            streamrClient,
            this.pluginConfig.pingSendInterval,
            this.pluginConfig.disconnectTimeout
        )
        await this.server.start(
            this.pluginConfig.port,
            getPayloadFormat(this.pluginConfig.payloadMetadata),
            this.getApiAuthentication(),
            this.pluginConfig.sslCertificate
        )
    }

    async stop(): Promise<void> {
        await this.server!.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
