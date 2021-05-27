import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { MqttServer } from './MqttServer'
import { Bridge } from './Bridge'

export interface MqttPluginConfig {
    port: number
    streamIdDomain: string|null
}

export class MqttPlugin extends Plugin<MqttPluginConfig> {

    private server?: MqttServer

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        this.server = new MqttServer(this.pluginConfig.port, this.apiAuthenticator)
        const bridge = new Bridge(this.streamrClient!, this.server, this.pluginConfig.streamIdDomain ?? undefined)
        this.server.setListener(bridge)
        return this.server.start()
    }

    async stop() {
        await this.server!.stop()
    }

    getConfigSchema() {
        return PLUGIN_CONFIG_SCHEMA
    }
}
