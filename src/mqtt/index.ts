import net from 'net'
import MissingConfigError from '../errors/MissingConfigError'
import getLogger from '../helpers/logger'
import MqttServer from './MqttServer'
import { BrokerUtils } from '../types'
import { AdapterConfig } from '../Adapter'

const logger = getLogger('streamr:mqttAdapter')

// eslint-disable-next-line max-len
export const start = (
    { port, streamsTimeout }: AdapterConfig, 
    { networkNode, publisher, streamFetcher, metricsContext, subscriptionManager}: BrokerUtils
) => {
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
