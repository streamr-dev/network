import { Schema } from 'ajv'
import { Request, Response } from 'express'
import { StreamrClient } from '@streamr/sdk'
import { ApiPluginConfig, HttpServerEndpoint, Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export class InfoPlugin extends Plugin<ApiPluginConfig> {
    async start(streamrClient: StreamrClient): Promise<void> {
        this.addHttpServerEndpoint(InfoPlugin.createEndpoint(streamrClient))
    }

    private static createEndpoint(streamrClient: StreamrClient): HttpServerEndpoint {
        return {
            path: '/info',
            method: 'get',
            requestHandlers: [
                async (_req: Request, res: Response) => {
                    res.json(await streamrClient.getDiagnosticInfo())
                }
            ]
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
