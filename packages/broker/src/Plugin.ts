import { Logger } from '@streamr/utils'
import { Config } from './config/config'
import express from 'express'
import { validateConfig } from './config/validateConfig'
import { Schema } from 'ajv'
import { StreamrClient } from 'streamr-client'
import { ApiAuthenticator } from './apiAuthenticator'

export interface PluginOptions {
    name: string
    streamrClient: StreamrClient
    apiAuthenticator: ApiAuthenticator
    brokerConfig: Config
    abortSignal: AbortSignal
}

const logger = new Logger(module)

export abstract class Plugin<T> {

    readonly name: string
    readonly streamrClient: StreamrClient
    readonly apiAuthenticator: ApiAuthenticator
    readonly brokerConfig: Config
    readonly pluginConfig: T
    readonly abortSignal: AbortSignal
    private readonly httpServerRouters: express.Router[] = []

    constructor(options: PluginOptions) {
        this.name = options.name
        this.streamrClient = options.streamrClient
        this.apiAuthenticator = options.apiAuthenticator
        this.brokerConfig = options.brokerConfig
        this.pluginConfig = options.brokerConfig.plugins[this.name]
        this.abortSignal = options.abortSignal
        const configSchema = this.getConfigSchema()
        if (configSchema !== undefined) {
            validateConfig(this.pluginConfig, configSchema, `${this.name} plugin`)
        }
        if (this.stop !== undefined) {
            this.abortSignal.addEventListener('abort', () => {
                this.stop!().catch((err) => {
                    logger.error('error while stopping plugin %s: %s', this.name, err)
                })
            }, { once: true })
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
     * It is called only if the plugin was started successfully
     */
    protected stop?(): Promise<void>

    // eslint-disable-next-line class-methods-use-this
    getConfigSchema(): Schema | undefined {
        return undefined
    }
}
