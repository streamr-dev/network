import net from 'net'
import { MissingConfigError } from '../errors/MissingConfigError'
import { Logger } from 'streamr-network'
import { MqttServer } from './MqttServer'
import { BrokerUtils } from '../types'
import { AdapterConfig, AdapterStartFn } from '../Adapter'

const logger = new Logger(module)

export interface MqttAdapterConfig extends AdapterConfig {
    streamsTimeout: number|null
}

// eslint-disable-next-line max-len
export const start: AdapterStartFn<MqttAdapterConfig> = (
    { port, streamsTimeout }: MqttAdapterConfig, 
    { networkNode, publisher, streamFetcher, metricsContext, subscriptionManager}: BrokerUtils
): () => Promise<any> => {
    if (port === undefined) {
        throw new MissingConfigError('port')
    }

    if (streamsTimeout === undefined) {
        throw new MissingConfigError('streamsTimeout')
    }

    const mqttServer = new MqttServer(
        new net.Server().listen(port).on('listening', () => logger.info(`Mqtt adapter listening on ${port}`)),
        streamsTimeout,
        networkNode,
        streamFetcher,
        publisher,
        metricsContext,
        subscriptionManager
    )

    return () => mqttServer.close()
}
