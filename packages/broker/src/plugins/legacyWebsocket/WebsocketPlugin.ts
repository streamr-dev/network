import { MissingConfigError } from '../../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { Plugin, PluginOptions } from '../../Plugin'
import { StorageNodeRegistry } from '../../StorageNodeRegistry'
import { StreamFetcher } from '../../StreamFetcher'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Logger } from "streamr-network"
import fs from "fs"
import http from 'http'
import https from "https"

const logger = new Logger(module)

export interface WebsocketPluginConfig {
    port: number
    privateKeyFileName: string|null, 
    certFileName: string|null,
    pingInterval: number
}

export class WebsocketPlugin extends Plugin<WebsocketPluginConfig> {
    private websocketServer: WebsocketServer | undefined

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<unknown> {
        if (this.pluginConfig.port === undefined) {
            throw new MissingConfigError('port')
        }
        let httpServer: http.Server | https.Server
        if (this.pluginConfig.privateKeyFileName && this.pluginConfig.certFileName) {
            const opts = {
                key: fs.readFileSync(this.pluginConfig.privateKeyFileName),
                cert: fs.readFileSync(this.pluginConfig.certFileName)
            }
            httpServer = https.createServer(opts)
        } else {
            httpServer = http.createServer()
        }
        const storageNodeRegistry = StorageNodeRegistry.createInstance(this.brokerConfig)
        this.websocketServer = new WebsocketServer(
            httpServer,
            this.pluginConfig.port,
            this.networkNode,
            new StreamFetcher(this.brokerConfig.streamrUrl),
            this.publisher,
            this.metricsContext,
            this.subscriptionManager,
            storageNodeRegistry,
            this.brokerConfig.streamrUrl,
            this.pluginConfig.pingInterval,
        )
        return new Promise((resolve) => {
            httpServer.listen(this.pluginConfig.port, () => {
                logger.info(`started on port %s`, this.pluginConfig.port)
                resolve(true)
            })
        })
    }

    async stop(): Promise<unknown> {
        return this.websocketServer!.close()
    }

    getConfigSchema(): Record<string, unknown> {
        return PLUGIN_CONFIG_SCHEMA
    }
}
