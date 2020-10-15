const MissingConfigError = require('../errors/MissingConfigError')

const validateConfig = (config) => {
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
    if (config.network.trackers && config.trackerRegistry) {
        throw new Error('Not allowed to set both network.trackers and trackerRegistry.')
    }
    if (config.network.trackers && !Array.isArray(config.network.trackers)) {
        throw new MissingConfigError('network.trackers must be array')
    }
    if (config.network.isStorageNode === undefined) {
        throw new MissingConfigError('network.isStorageNode')
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
    if (config.adapters === undefined) {
        throw new MissingConfigError('adapters')
    }
    if (config.reporting === undefined) {
        throw new MissingConfigError('reporting')
    }
    if (config.reporting && (config.reporting.streamId !== undefined || config.reporting.apiKey !== undefined)) {
        if (config.reporting.apiKey === undefined) {
            throw new MissingConfigError('reporting.apiKey')
        }
        if (config.reporting.streamId === undefined) {
            throw new MissingConfigError('reporting.streamId')
        }
    }
    if (config.reporting && config.reporting.reportingIntervalSeconds === undefined) {
        throw new MissingConfigError('reporting.reportingIntervalSeconds')
    }
    if (config.sentry === undefined) {
        throw new MissingConfigError('sentry')
    }
    if (config.trackerRegistry && config.trackerRegistry.jsonRpcProvider === undefined) {
        throw new MissingConfigError('trackerRegistry.jsonRpcProvider')
    }
    if (config.trackerRegistry && config.trackerRegistry.address === undefined) {
        throw new MissingConfigError('trackerRegistry.address')
    }
    if (config.thresholdForFutureMessageSeconds === undefined) {
        // eslint-disable-next-line no-param-reassign
        config.thresholdForFutureMessageSeconds = 300
    }
    if (config.ethereum === undefined) {
        throw new MissingConfigError('ethereum')
    }
    if (config.ethereum.privateKey === undefined && config.ethereum.generateWallet === undefined) {
        throw new MissingConfigError('ethereum.privateKey or ethereum.generateWallet must be defined.')
    }
    if (config.ethereum.privateKey && config.ethereum.generateWallet === true) {
        throw new MissingConfigError('ethereum.privateKey and ethereum.generateWallet defined, define only one option.')
    }
    if (config.location === undefined) {
        throw new MissingConfigError('location')
    }
    if (config.location && config.location.city === undefined) {
        throw new MissingConfigError('location.city')
    }
    if (config.location && config.location.country === undefined) {
        throw new MissingConfigError('location.country')
    }
    if (config.location && config.location.latitude === undefined) {
        throw new MissingConfigError('location.latitude')
    }
    if (config.location && config.location.longitude === undefined) {
        throw new MissingConfigError('location.longitude')
    }

    config.adapters.forEach(({ name }, index) => {
        if (name === undefined) {
            throw new MissingConfigError(`adapters[${index}].name`)
        }
    })
}

module.exports = validateConfig
