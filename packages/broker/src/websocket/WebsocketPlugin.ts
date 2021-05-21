import ws from 'uWebSockets.js'
import { MissingConfigError } from '../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { Plugin, PluginOptions, PluginConfig } from '../Plugin'
import { StorageNodeRegistry } from '../StorageNodeRegistry'
import { StreamFetcher } from '../StreamFetcher'

export interface WsPluginConfig extends PluginConfig {
    privateKeyFileName: string|null, 
    certFileName: string|null,
    pingInterval: number
}

export class WebsocketPlugin extends Plugin<WsPluginConfig> {

    private websocketServer: WebsocketServer|undefined

    constructor(options: PluginOptions<WsPluginConfig>) {
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
        const storageNodeRegistry = StorageNodeRegistry.createInstance(this.config)
        this.websocketServer = new WebsocketServer(
            server,
            this.pluginConfig.port,
            this.networkNode,
            new StreamFetcher(this.config.streamrUrl),
            this.publisher,
            this.metricsContext,
            this.subscriptionManager,
            storageNodeRegistry!,
            this.config.streamrUrl,
            this.pluginConfig.pingInterval,
        )
    }

    async stop() {
        return this.websocketServer!.close()
    }
}
