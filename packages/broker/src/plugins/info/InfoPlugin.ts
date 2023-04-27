import { Request, Response } from 'express'
import { ApiPluginConfig, HttpServerEndpoint, Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'

export class InfoPlugin extends Plugin<ApiPluginConfig> {
    async start(): Promise<void> {
        this.addHttpServerEndpoint(this.createEndpoint())
    }

    private createEndpoint(): HttpServerEndpoint {
        return {
            path: '/info',
            method: 'get',
            requestHandlers: [async (_req: Request, res: Response) => {
                res.json(await this.streamrClient.getDiagnosticInfo())
            }]
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
