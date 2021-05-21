import { MetricsContext, NetworkNode } from 'streamr-network'
import { Storage } from './storage/Storage'
import { StorageConfig } from './storage/StorageConfig'
import { AdapterConfig } from './Adapter'
import { Config } from './config'
import { Publisher } from './Publisher'
import { SubscriptionManager } from './SubscriptionManager'

export interface PluginOptions<T> {
    networkNode: NetworkNode
    subscriptionManager: SubscriptionManager
    publisher: Publisher
    metricsContext: MetricsContext
    cassandraStorage: Storage|null
    storageConfig: StorageConfig|null
    config: Config
    adapterConfig: T
}

export abstract class Plugin<T extends AdapterConfig> {

    readonly networkNode: NetworkNode
    readonly subscriptionManager: SubscriptionManager
    readonly publisher: Publisher
    readonly metricsContext: MetricsContext
    readonly cassandraStorage: Storage|null
    readonly storageConfig: StorageConfig|null
    readonly config: Config
    readonly adapterConfig: T

    constructor(options: PluginOptions<T>) {
        this.networkNode = options.networkNode
        this.subscriptionManager = options.subscriptionManager
        this.publisher = options.publisher
        this.metricsContext = options.metricsContext
        this.cassandraStorage = options.cassandraStorage
        this.storageConfig = options.storageConfig
        this.config = options.config
        this.adapterConfig = options.adapterConfig
    }

    abstract start(): Promise<unknown>

    abstract stop(): Promise<unknown>
}