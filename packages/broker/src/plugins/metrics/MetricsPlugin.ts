import { router as volumeEndpoint } from './VolumeEndpoint'
import { Plugin, PluginOptions } from '../../Plugin'

export class MetricsPlugin extends Plugin<void> {

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        this.addHttpServerRouter(volumeEndpoint(this.metricsContext))    
    }

    async stop() {
    }
}