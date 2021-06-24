import net from 'net'
import { MissingConfigError } from '../../errors/MissingConfigError'
import { Logger } from 'streamr-network'
import { MqttServer } from './MqttServer'
import { Plugin, PluginDefinition, PluginOptions } from '../../Plugin'
import { StreamFetcher } from '../../StreamFetcher'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

const logger = new Logger(module)

export interface MqttPluginConfig {
    port: number
    streamsTimeout: number|null
}

export class MqttPlugin extends Plugin<MqttPluginConfig> {

    private mqttServer: MqttServer|undefined

    constructor(options: PluginOptions) {
        super(options)
    }

    async start() {
        if (this.pluginConfig.port === undefined) {
            throw new MissingConfigError('port')
        }
        if (this.pluginConfig.streamsTimeout === undefined) {
            throw new MissingConfigError('streamsTimeout')
        }
        this.mqttServer = new MqttServer(
            new net.Server().listen(this.pluginConfig.port).on('listening', () => logger.info(`Mqtt plugin listening on ${this.pluginConfig.port}`)),
            this.pluginConfig.streamsTimeout,
            this.networkNode,
            new StreamFetcher(this.brokerConfig.streamrUrl),
            this.publisher,
            this.metricsContext,
            this.subscriptionManager
        )
    }

    async stop() {
        return this.mqttServer!.close()
    }
}

const DEFINITION: PluginDefinition<MqttPluginConfig> = {
    name: 'legacyMqtt',
    createInstance: (options: PluginOptions) => {
        return new MqttPlugin(options)
    },
    getConfigSchema: () => {
        return PLUGIN_CONFIG_SCHEMA
    }
}
export default DEFINITION