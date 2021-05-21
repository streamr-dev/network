import { MetricsContext, NetworkNode } from 'streamr-network'
import { Storage } from './storage/Storage'
import { StorageConfig } from './storage/StorageConfig'
import { Config } from './config'
import { Publisher } from './Publisher'
import { SubscriptionManager } from './SubscriptionManager'

export interface PluginConfig {
    name: string
    port: number
}

export interface PluginOptions<T> {
    networkNode: NetworkNode
    subscriptionManager: SubscriptionManager
    publisher: Publisher
    metricsContext: MetricsContext
    cassandraStorage: Storage|null
    storageConfig: StorageConfig|null
    config: Config
    pluginConfig: T
}

export abstract class Plugin<T extends PluginConfig> {

    readonly networkNode: NetworkNode
    readonly subscriptionManager: SubscriptionManager
    readonly publisher: Publisher
    readonly metricsContext: MetricsContext
    readonly cassandraStorage: Storage|null
    readonly storageConfig: StorageConfig|null
    readonly config: Config
    readonly pluginConfig: T

    constructor(options: PluginOptions<T>) {
        this.networkNode = options.networkNode
        this.subscriptionManager = options.subscriptionManager
        this.publisher = options.publisher
        this.metricsContext = options.metricsContext
        this.cassandraStorage = options.cassandraStorage
        this.storageConfig = options.storageConfig
        this.config = options.config
        this.pluginConfig = options.pluginConfig
    }

    abstract start(): Promise<unknown>

    abstract stop(): Promise<unknown>
}