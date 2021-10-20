import { router as dataProduceEndpoints } from './DataProduceEndpoints'
import { Plugin, PluginOptions } from '../../Plugin'
import { StreamFetcher } from '../../StreamFetcher'

export class PublishHttpPlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        const streamFetcher = new StreamFetcher(this.brokerConfig.streamrUrl)
        this.addHttpServerRouter(dataProduceEndpoints(streamFetcher, this.publisher))
    }

    async stop(): Promise<void> {
    }
}