import { MetricsContext, NetworkNode } from 'streamr-network'
import { Storage } from './storage/Storage'
import { StorageConfig } from './storage/StorageConfig'
import { Config } from './config'
import { Publisher } from './Publisher'
import { SubscriptionManager } from './SubscriptionManager'
import express from 'express'
import { validateConfig } from './helpers/validateConfig'
import { Schema } from 'ajv'

export interface PluginOptions {
    name: string
    networkNode: NetworkNode
    subscriptionManager: SubscriptionManager
    publisher: Publisher
    metricsContext: MetricsContext
    cassandraStorage: Storage|null
    storageConfig: StorageConfig|null
    brokerConfig: Config
}

export abstract class Plugin<T> {

    readonly name: string
    readonly networkNode: NetworkNode
    readonly subscriptionManager: SubscriptionManager
    readonly publisher: Publisher
    readonly metricsContext: MetricsContext
    readonly cassandraStorage: Storage|null
    readonly storageConfig: StorageConfig|null
    readonly brokerConfig: Config
    readonly pluginConfig: T
    private readonly httpServerRouters: express.Router[] = []

    constructor(options: PluginOptions) {
        this.name = options.name
        this.networkNode = options.networkNode
        this.subscriptionManager = options.subscriptionManager
        this.publisher = options.publisher
        this.metricsContext = options.metricsContext
        this.cassandraStorage = options.cassandraStorage
        this.storageConfig = options.storageConfig
        this.brokerConfig = options.brokerConfig
        this.pluginConfig = options.brokerConfig.plugins[this.name]
        const configSchema = this.getConfigSchema()
        if (configSchema !== undefined) {
            validateConfig(this.pluginConfig, configSchema, `${this.name} plugin`)
        }
    }

    addHttpServerRouter(router: express.Router) {
        this.httpServerRouters.push(router)
    }

    getHttpServerRoutes() {
        return this.httpServerRouters
    }

    abstract start(): Promise<unknown>

    abstract stop(): Promise<unknown>

    getConfigSchema(): Schema|undefined {
        return undefined
    }
}