import { MissingConfigError } from '../../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { Plugin, PluginOptions } from '../../Plugin'
import { StreamFetcher } from '../../StreamFetcher'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Logger, Protocol } from "streamr-network"
import { DEFAULTS } from 'streamr-client'
import { once } from "events"
import fs from "fs"
import http from 'http'
import https from "https"
import { Schema } from 'ajv'
import { NetworkSmartContract, NodeRegistryItem, NodeRegistryOptions, StorageNodeRegistry } from '../../StorageNodeRegistry'

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
        this.websocketServer = new WebsocketServer(
            httpServer,
            this.networkNode,
            new StreamFetcher(this.getRestUrl()),
            this.publisher,
            (await (this.streamrClient!.getNode())).getMetricsContext(),
            this.subscriptionManager,
            await this.getStorageNodeRegistry(),
            this.pluginConfig.pingInterval,
        )
        httpServer.listen(this.pluginConfig.port)
        await once(httpServer, 'listening')
        logger.info(`started on port %s`, this.pluginConfig.port)
        return true
    }

    async stop(): Promise<unknown> {
        return this.websocketServer!.close()
    }

    private async getStorageNodeRegistry() {
        const config = this.brokerConfig.client.storageNodeRegistry ?? DEFAULTS.storageNodeRegistry
        const storageNodes = await this.getStorageNodes(config)
        return StorageNodeRegistry.createInstance(this.getRestUrl(), storageNodes)
    }
    
    private async getStorageNodes(config: NodeRegistryOptions): Promise<NodeRegistryItem[]> {
        if ((config as NetworkSmartContract).contractAddress !== undefined) {
            const registry = await Protocol.Utils.getStorageNodeRegistryFromContract({
                contractAddress: (config as NetworkSmartContract).contractAddress,
                jsonRpcProvider: (config as NetworkSmartContract).jsonRpcProvider
            })
            return registry.getAllStorageNodes()
        } else {
            return config as NodeRegistryItem[]
        }
    }
    
    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
