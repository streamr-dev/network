import { router as dataProduceEndpoints } from './DataProduceEndpoints'
import { router as volumeEndpoint } from './VolumeEndpoint'
import { Plugin, PluginOptions } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

export class HttpPlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        const streamFetcher = new StreamFetcher(this.brokerConfig.streamrUrl)
        this.addHttpServerRouter(dataProduceEndpoints(streamFetcher, this.publisher))
        this.addHttpServerRouter(volumeEndpoint(this.metricsContext))    
    }

    async stop() {
    }
}