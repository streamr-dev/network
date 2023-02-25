import { StrictConfig } from './config/config'
import { validateConfig } from './config/validateConfig'
import { Schema } from 'ajv'
import { StreamrClient } from 'streamr-client'
import { ApiAuthenticator } from './apiAuthenticator'
import { Endpoint } from './httpServer'

export interface PluginOptions {
    name: string
    streamrClient: StreamrClient
    apiAuthenticator: ApiAuthenticator
    brokerConfig: StrictConfig
}

export abstract class Plugin<T> {

    readonly name: string
    readonly streamrClient: StreamrClient
    readonly apiAuthenticator: ApiAuthenticator
    readonly brokerConfig: StrictConfig
    readonly pluginConfig: T
    private readonly httpServerRouters: Endpoint[] = []

    constructor(options: PluginOptions) {
        this.name = options.name
        this.streamrClient = options.streamrClient
        this.apiAuthenticator = options.apiAuthenticator
        this.brokerConfig = options.brokerConfig
        this.pluginConfig = options.brokerConfig.plugins[this.name]
        const configSchema = this.getConfigSchema()
        if (configSchema !== undefined) {
            validateConfig(this.pluginConfig, configSchema, `${this.name} plugin`)
        }
    }

    addHttpServerEndpoint(route: Endpoint): void {
        this.httpServerRouters.push(route)
    }

    getHttpServerEndpoints(): Endpoint[] {
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

    // eslint-disable-next-line class-methods-use-this
    getConfigSchema(): Schema | undefined {
        return undefined
    }
}
