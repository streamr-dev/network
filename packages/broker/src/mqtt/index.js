const net = require('net')

const MissingConfigError = require('../errors/MissingConfigError')
const adapterRegistry = require('../adapterRegistry')
const logger = require('../helpers/logger')('streamr:mqttAdapter')

const MqttServer = require('./MqttServer')

// eslint-disable-next-line max-len
adapterRegistry.register('mqtt', ({ port, streamsTimeout }, {
    networkNode, publisher, streamFetcher, metricsContext, subscriptionManager
}) => {
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
})
