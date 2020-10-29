const MissingConfigError = require('../errors/MissingConfigError')

const validateConfig = (config) => {
    if (config.ethereumPrivateKey === undefined) {
        throw new MissingConfigError('ethereumPrivateKey')
    }
    if (config.network === undefined) {
        throw new MissingConfigError('network')
    }
    if (config.network.name === undefined) {
        throw new MissingConfigError('network.name')
    }
    if (config.network.hostname === undefined) {
        throw new MissingConfigError('network.hostname')
    }
    if (config.network.port === undefined) {
        throw new MissingConfigError('network.port')
    }
    if (config.network.advertisedWsUrl === undefined) {
        throw new MissingConfigError('network.advertisedWsUrl')
    }
    if (config.network.trackers === undefined && config.trackerRegistry === undefined) {
        throw new MissingConfigError('network.trackers or network.trackerRegistry must be defined')
    }
    if (config.network.trackers && config.network.trackerRegistry) {
        throw new Error('Not allowed to set both network.trackers and network.trackerRegistry.')
    }
    if (config.network.trackers && !Array.isArray(config.network.trackers)) {
        throw new MissingConfigError('network.trackers must be array')
    }
    if (config.network.trackerRegistry && config.network.trackerRegistry.jsonRpcProvider === undefined) {
        throw new MissingConfigError('network.trackerRegistry.jsonRpcProvider')
    }
    if (config.network.trackerRegistry && config.network.trackerRegistry.address === undefined) {
        throw new MissingConfigError('network.trackerRegistry.address')
    }
    if (config.network.isStorageNode === undefined) {
        throw new MissingConfigError('network.isStorageNode')
    }
    if (config.network.location === undefined) {
        throw new MissingConfigError('network.location')
    }
    if (config.network.location && config.network.location.city === undefined) {
        throw new MissingConfigError('network.location.city')
    }
    if (config.network.location && config.network.location.country === undefined) {
        throw new MissingConfigError('network.location.country')
    }
    if (config.network.location && config.network.location.latitude === undefined) {
        throw new MissingConfigError('network.location.latitude')
    }
    if (config.network.location && config.network.location.longitude === undefined) {
        throw new MissingConfigError('network.location.longitude')
    }
    if (config.cassandra === undefined) {
        throw new MissingConfigError('cassandra')
    }
    if (config.cassandra && config.cassandra.hosts === undefined) {
        throw new MissingConfigError('cassandra.hosts')
    }
    if (config.cassandra && config.cassandra.username === undefined) {
        throw new MissingConfigError('cassandra.username')
    }
    if (config.cassandra && config.cassandra.password === undefined) {
        throw new MissingConfigError('cassandra.password')
    }
    if (config.cassandra && config.cassandra.keyspace === undefined) {
        throw new MissingConfigError('cassandra.keyspace')
    }
    if (config.cassandra && config.cassandra.datacenter === undefined) {
        throw new MissingConfigError('cassandra.datacenter')
    }
    if (config.streamrUrl === undefined) {
        throw new MissingConfigError('streamrUrl')
    }
    if (config.reporting === undefined) {
        throw new MissingConfigError('reporting')
    }
    if (config.reporting && config.reporting.streamr === undefined) {
        throw new MissingConfigError('reporting.streamr')
    }
    if (config.reporting && config.reporting.streamr) {
        if (config.reporting.streamr.apiKey === undefined) {
            throw new MissingConfigError('reporting.apiKey')
        }
        if (config.reporting.streamr.streamId === undefined) {
            throw new MissingConfigError('reporting.streamId')
        }
    }
    if (config.reporting && config.reporting.intervalInSeconds === undefined) {
        throw new MissingConfigError('reporting.intervalInSeconds')
    }
    if (config.reporting && config.reporting.sentry === undefined) {
        throw new MissingConfigError('sentry')
    }
    if (config.adapters === undefined) {
        throw new MissingConfigError('adapters')
    }

    config.adapters.forEach(({ name }, index) => {
        if (name === undefined) {
            throw new MissingConfigError(`adapters[${index}].name`)
        }
    })
}

module.exports = validateConfig
