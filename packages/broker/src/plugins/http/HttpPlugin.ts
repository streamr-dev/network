import { createEndpoint } from './publishEndpoint'
import { Plugin, PluginOptions } from '../../Plugin'

export class HttpPlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        this.addHttpServerRouter(createEndpoint(this.streamrClient!))
    }

    async stop(): Promise<void> {
    }
}