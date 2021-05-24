import { MetricsContext, NetworkNode } from 'streamr-network'
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
    brokerConfig: Config
}

export abstract class Plugin<T> {

    readonly name: string
    readonly networkNode: NetworkNode
    readonly subscriptionManager: SubscriptionManager
    readonly publisher: Publisher
    readonly metricsContext: MetricsContext
    readonly brokerConfig: Config
    readonly pluginConfig: T
    private readonly httpServerRouters: express.Router[] = []

    constructor(options: PluginOptions) {
        this.name = options.name
        this.networkNode = options.networkNode
        this.subscriptionManager = options.subscriptionManager
        this.publisher = options.publisher
        this.metricsContext = options.metricsContext
        this.brokerConfig = options.brokerConfig
        this.pluginConfig = options.brokerConfig.plugins[this.name]
        const configSchema = this.getConfigSchema()
        if (configSchema !== undefined) {
            validateConfig(this.pluginConfig, configSchema, `${this.name} plugin`)
        }
    }

    addHttpServerRouter(router: express.Router): void {
        this.httpServerRouters.push(router)
    }

    getHttpServerRoutes(): express.Router[] {
        return this.httpServerRouters
    }

    /**
     * This lifecycle method is called once when Broker starts
     */
    abstract start(): Promise<unknown>

    /**
     * This lifecycle method is called once when Broker stops
     * It is be called only if the plugin was started successfully
     */
    abstract stop(): Promise<unknown>

    getConfigSchema(): Schema|undefined {
        return undefined
    }
}