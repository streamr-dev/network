import ws from 'uWebSockets.js'
import { MissingConfigError } from '../../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { Plugin, PluginOptions } from '../../Plugin'
import { StreamFetcher } from '../../StreamFetcher'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export interface WebsocketPluginConfig {
    port: number
    privateKeyFileName: string|null, 
    certFileName: string|null,
    pingInterval: number
}

export class WebsocketPlugin extends Plugin<WebsocketPluginConfig> {

    private websocketServer: WebsocketServer|undefined

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        if (this.pluginConfig.port === undefined) {
            throw new MissingConfigError('port')
        }
        let server
        if (this.pluginConfig.privateKeyFileName && this.pluginConfig.certFileName) {
            server = ws.SSLApp({
                key_file_name: this.pluginConfig.privateKeyFileName,
                cert_file_name: this.pluginConfig.certFileName,
            })
        } else {
            server = ws.App()
        }
        this.websocketServer = new WebsocketServer(
            server,
            this.pluginConfig.port,
            this.networkNode,
            new StreamFetcher(this.brokerConfig.streamrUrl),
            this.publisher,
            this.metricsContext,
            this.subscriptionManager,
            this.storageNodeRegistry,
            this.brokerConfig.streamrUrl,
            this.pluginConfig.pingInterval,
        )
    }

    async stop() {
        return this.websocketServer!.close()
    }

    getConfigSchema() {
        return PLUGIN_CONFIG_SCHEMA
    }
}
