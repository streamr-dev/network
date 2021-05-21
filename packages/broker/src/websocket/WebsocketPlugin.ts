import ws from 'uWebSockets.js'
import { MissingConfigError } from '../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { AdapterConfig } from '../Adapter'
import { Plugin, PluginOptions } from '../Plugin'
import { StorageNodeRegistry } from '../StorageNodeRegistry'
import { StreamFetcher } from '../StreamFetcher'

export interface WsAdapterConfig extends AdapterConfig {
    privateKeyFileName: string|null, 
    certFileName: string|null,
    pingInterval: number
}

export class WebsocketPlugin extends Plugin<WsAdapterConfig> {

    private websocketServer: WebsocketServer|undefined

    constructor(options: PluginOptions<WsAdapterConfig>) {
        super(options)
    }

    async start() {
        if (this.adapterConfig.port === undefined) {
            throw new MissingConfigError('port')
        }
        let server
        if (this.adapterConfig.privateKeyFileName && this.adapterConfig.certFileName) {
            server = ws.SSLApp({
                key_file_name: this.adapterConfig.privateKeyFileName,
                cert_file_name: this.adapterConfig.certFileName,
            })
        } else {
            server = ws.App()
        }
        const storageNodeRegistry = StorageNodeRegistry.createInstance(this.config)
        this.websocketServer = new WebsocketServer(
            server,
            this.adapterConfig.port,
            this.networkNode,
            new StreamFetcher(this.config.streamrUrl),
            this.publisher,
            this.metricsContext,
            this.subscriptionManager,
            storageNodeRegistry!,
            this.config.streamrUrl,
            this.adapterConfig.pingInterval,
        )
    }

    async stop() {
        return this.websocketServer!.close()
    }
}
