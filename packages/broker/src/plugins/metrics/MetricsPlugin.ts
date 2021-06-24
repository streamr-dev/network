import { router as volumeEndpoint } from './VolumeEndpoint'
import { Plugin, PluginDefinition, PluginOptions } from '../../Plugin'

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

const DEFINITION: PluginDefinition<void> = {
    name: 'metrics',
    createInstance: (options: PluginOptions) => {
        return new MetricsPlugin(options)
    },
    getConfigSchema: () => {
        return undefined
    }
}
export default DEFINITION