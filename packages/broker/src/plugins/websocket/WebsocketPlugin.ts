import { Plugin } from '../../Plugin'
import { getPayloadFormat } from '../../helpers/PayloadFormat'
import { WebsocketServer } from './WebsocketServer'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'

export interface SslCertificateConfig {
    privateKeyFileName: string
    certFileName: string
}

export interface WebsocketPluginConfig {
    port: number
    payloadMetadata: boolean
    sslCertificate: SslCertificateConfig | null
}

export class WebsocketPlugin extends Plugin<WebsocketPluginConfig> {
    private server?: WebsocketServer

    async start(): Promise<void> {
        this.server = new WebsocketServer(this.streamrClient!)
        await this.server.start(
            this.pluginConfig.port, 
            getPayloadFormat(this.pluginConfig.payloadMetadata),
            this.apiAuthenticator, 
            this.pluginConfig.sslCertificate ?? undefined
        )
    }

    protected override async stop(): Promise<void> {
        await this.server!.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
