import net from 'net'
import { MissingConfigError } from '../errors/MissingConfigError'
import { Logger } from 'streamr-network'
import { MqttServer } from './MqttServer'
import { Plugin, PluginOptions, PluginConfig } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

const logger = new Logger(module)

export interface MqttPluginConfig extends PluginConfig {
    streamsTimeout: number|null
}

export class MqttPlugin extends Plugin<MqttPluginConfig> {

    private mqttServer: MqttServer|undefined

    constructor(options: PluginOptions<MqttPluginConfig>) {
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
            new StreamFetcher(this.config.streamrUrl),
            this.publisher,
            this.metricsContext,
            this.subscriptionManager
        )
    }

    async stop() {
        return this.mqttServer!.close()
    }
}
