import { Plugin, PluginDefinition, PluginOptions } from '../../Plugin'
import { SslCertificateConfig } from '../../types'
import { WebsocketServer } from './WebsocketServer'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export interface WebsocketPluginConfig {
    port: number
    sslCertificate: SslCertificateConfig|null
}

export class WebsocketPlugin extends Plugin<WebsocketPluginConfig> {

    private server?: WebsocketServer

    constructor(options: PluginOptions) {
        super(options)
        if (this.streamrClient === undefined) {
            throw new Error('StreamrClient is not available')   
        }
    }

    async start() {
        this.server = new WebsocketServer(this.streamrClient!)
        await this.server.start(this.pluginConfig.port, this.apiAuthenticator, this.pluginConfig.sslCertificate ?? undefined)
    }

    async stop() {
        await this.server!.stop()
    }
}

const DEFINITION: PluginDefinition<WebsocketPluginConfig> = {
    name: 'websocket',
    createInstance: (options: PluginOptions) => {
        return new WebsocketPlugin(options)
    },
    getConfigSchema: () => {
        return PLUGIN_CONFIG_SCHEMA
    }
}
export default DEFINITION