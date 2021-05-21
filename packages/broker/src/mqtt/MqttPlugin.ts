import net from 'net'
import { MissingConfigError } from '../errors/MissingConfigError'
import { Logger } from 'streamr-network'
import { MqttServer } from './MqttServer'
import { AdapterConfig } from '../Adapter'
import { Plugin, PluginOptions } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

const logger = new Logger(module)

export interface MqttAdapterConfig extends AdapterConfig {
    streamsTimeout: number|null
}

export class MqttPlugin extends Plugin<MqttAdapterConfig> {

    private mqttServer: MqttServer|undefined

    constructor(options: PluginOptions<MqttAdapterConfig>) {
        super(options)
    }

    async start() {
        if (this.adapterConfig.port === undefined) {
            throw new MissingConfigError('port')
        }
        if (this.adapterConfig.streamsTimeout === undefined) {
            throw new MissingConfigError('streamsTimeout')
        }
        this.mqttServer = new MqttServer(
            new net.Server().listen(this.adapterConfig.port).on('listening', () => logger.info(`Mqtt adapter listening on ${this.adapterConfig.port}`)),
            this.adapterConfig.streamsTimeout,
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
