import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataProduceEndpoints } from './DataProduceEndpoints'
import { router as volumeEndpoint } from './VolumeEndpoint'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { Plugin, PluginOptions, PluginConfig } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

export class HttpPlugin extends Plugin<PluginConfig> {

    constructor(options: PluginOptions<PluginConfig>) {
        super(options)
    }

    async start() {
        const streamFetcher = new StreamFetcher(this.config.streamrUrl)
        this.addHttpServerRouter(dataProduceEndpoints(streamFetcher, this.publisher))
        this.addHttpServerRouter(volumeEndpoint(this.metricsContext))    
        if (this.config.network.isStorageNode) {
            this.addHttpServerRouter(dataQueryEndpoints(this.cassandraStorage!, streamFetcher, this.metricsContext))
            this.addHttpServerRouter(dataMetadataEndpoint(this.cassandraStorage!))
            this.addHttpServerRouter(storageConfigEndpoints(this.storageConfig!))    
        }
    }

    async stop() {
    }
}