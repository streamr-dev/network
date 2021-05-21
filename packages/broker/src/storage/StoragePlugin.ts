import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { Plugin, PluginOptions } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

export class StoragePlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        const streamFetcher = new StreamFetcher(this.brokerConfig.streamrUrl)
        this.addHttpServerRouter(dataQueryEndpoints(this.cassandraStorage!, streamFetcher, this.metricsContext))
        this.addHttpServerRouter(dataMetadataEndpoint(this.cassandraStorage!))
        this.addHttpServerRouter(storageConfigEndpoints(this.storageConfig!))
    }

    async stop() {
    }
}