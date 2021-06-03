import WebSocket from "ws"
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
import * as util from "util"

const logger = new Logger(module)

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
        let httpServer: http.Server | https.Server
        if (this.pluginConfig.privateKeyFileName && this.pluginConfig.certFileName) {
            const opts = {
                key: fs.readFileSync(this.pluginConfig.privateKeyFileName),
                cert: fs.readdirSync(this.pluginConfig.certFileName)
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
        return util.promisify(() => httpServer.listen(this.pluginConfig.port))()
            .then(() => {
                logger.info('WS plugin listening on ' + this.pluginConfig.port)
            })
    }

    async stop() {
        return this.websocketServer!.close()
    }

    getConfigSchema() {
        return PLUGIN_CONFIG_SCHEMA
    }
}
