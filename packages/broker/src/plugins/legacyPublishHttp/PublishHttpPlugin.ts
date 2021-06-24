import { router as dataProduceEndpoints } from './DataProduceEndpoints'
import { Plugin, PluginDefinition, PluginOptions } from '../../Plugin'
import { StreamFetcher } from '../../StreamFetcher'

export class PublishHttpPlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        const streamFetcher = new StreamFetcher(this.brokerConfig.streamrUrl)
        this.addHttpServerRouter(dataProduceEndpoints(streamFetcher, this.publisher))
    }

    async stop() {
    }
}

const DEFINITION: PluginDefinition<void> = {
    name: 'legacyPublishHttp',
    createInstance: (options: PluginOptions) => {
        return new PublishHttpPlugin(options)
    },
    getConfigSchema: () => {
        return undefined
    }
}
export default DEFINITION
