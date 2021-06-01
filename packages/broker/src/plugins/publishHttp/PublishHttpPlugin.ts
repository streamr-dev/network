import { createEndpoint } from './publishEndpoint'
import { Plugin, PluginOptions } from '../../Plugin'

export class PublishHttpPlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
        if (this.streamrClient === undefined) {
            throw new Error('StreamrClient is not available')   
        }
    }

    async start() {
        this.addHttpServerRouter(createEndpoint(this.streamrClient!))
    }

    async stop() {
    }
}