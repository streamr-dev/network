import { StrictConfig } from './config/config'
import { validateConfig } from './config/validateConfig'
import { Schema } from 'ajv'
import { StreamrClient } from '@streamr/sdk'
import { Endpoint } from './httpServer'
import { ApiAuthentication } from './apiAuthentication'

export interface ApiPluginConfig {
    apiAuthentication?: ApiAuthentication | null
}

export type HttpServerEndpoint = Omit<Endpoint, 'apiAuthentication'>

export abstract class Plugin<T extends object> {
    readonly name: string
    readonly pluginConfig: T
    readonly brokerConfig: StrictConfig
    private readonly httpServerEndpoints: HttpServerEndpoint[] = []

    constructor(name: string, brokerConfig: StrictConfig) {
        this.name = name
        this.brokerConfig = brokerConfig
        this.pluginConfig = brokerConfig.plugins[this.name]
        const configSchema = this.getConfigSchema()
        if (configSchema !== undefined) {
            validateConfig(this.pluginConfig, configSchema, `${this.name} plugin`)
        }
    }

    getApiAuthentication(): ApiAuthentication | undefined {
        if ('apiAuthentication' in this.pluginConfig) {
            return (this.pluginConfig.apiAuthentication as ApiAuthentication | null) ?? undefined
        } else {
            return this.brokerConfig.apiAuthentication
        }
    }

    addHttpServerEndpoint(endpoint: HttpServerEndpoint): void {
        this.httpServerEndpoints.push(endpoint)
    }

    getHttpServerEndpoints(): HttpServerEndpoint[] {
        return this.httpServerEndpoints
    }

    /**
     * This lifecycle method is called once when Broker starts
     */
    abstract start(streamrClient: StreamrClient): Promise<unknown>

    /**
     * This lifecycle method is called once when Broker stops
     * It is be called only if the plugin was started successfully
     */
    abstract stop(): Promise<unknown>

    // eslint-disable-next-line class-methods-use-this
    getConfigSchema(): Schema | undefined {
        return undefined
    }

    // eslint-disable-next-line class-methods-use-this
    getClientConfig(): { path: string; value: any }[] {
        return []
    }
}
