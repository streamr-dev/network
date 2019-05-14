const { startNetworkNode } = require('@streamr/streamr-p2p-network')

const StreamFetcher = require('./StreamFetcher')
const { startCassandraStorage } = require('./Storage')
const Publisher = require('./Publisher')
const VolumeLogger = require('./VolumeLogger')
const MissingConfigError = require('./errors/MissingConfigError')

const adapterRegistry = require('./adapterRegistry')

module.exports = async (config) => {
    // Validate that configuration exists
    if (config.network === undefined) {
        throw new MissingConfigError('network')
    }
    if (config.network.id === undefined) {
        throw new MissingConfigError('network.id')
    }
    if (config.network.hostname === undefined) {
        throw new MissingConfigError('network.hostname')
    }
    if (config.network.port === undefined) {
        throw new MissingConfigError('network.port')
    }
    if (config.network.tracker === undefined) {
        throw new MissingConfigError('network.tracker')
    }
    if (config.cassandra === undefined) {
        throw new MissingConfigError('cassandra')
    }
    if (config.cassandra.hosts === undefined) {
        throw new MissingConfigError('cassandra.hosts')
    }
    if (config.cassandra.username === undefined) {
        throw new MissingConfigError('cassandra.username')
    }
    if (config.cassandra.password === undefined) {
        throw new MissingConfigError('cassandra.password')
    }
    if (config.cassandra.keyspace === undefined) {
        throw new MissingConfigError('cassandra.keyspace')
    }
    if (config.streamrUrl === undefined) {
        throw new MissingConfigError('streamrUrl')
    }
    if (config.adapters === undefined) {
        throw new MissingConfigError('adapters')
    }
    config.adapters.forEach(({ name }, index) => {
        if (name === undefined) {
            throw new MissingConfigError(`adapters[${index}].name`)
        }
    })

    // Start cassandra storage
    const cassandraStorage = await startCassandraStorage(
        config.cassandra.hosts,
        'datacenter1',
        config.cassandra.keyspace,
        config.cassandra.username,
        config.cassandra.password,
    )

    // Start network node
    const networkNode = await startNetworkNode(
        config.network.hostname,
        config.network.port,
        config.network.id,
        [cassandraStorage],
    )
    networkNode.addBootstrapTracker(config.network.tracker)

    // Initialize common utilities
    const volumeLogger = new VolumeLogger()
    const streamFetcher = new StreamFetcher(config.streamrUrl)
    const publisher = new Publisher(networkNode, volumeLogger)

    // Start up adapters one-by-one, storing their close functions for further use
    const closeAdapterFns = config.adapters.map(({ name, ...adapterConfig }, index) => {
        try {
            return adapterRegistry.startAdapter(name, adapterConfig, {
                networkNode,
                publisher,
                streamFetcher,
                volumeLogger,
                config,
            })
        } catch (e) {
            if (e instanceof MissingConfigError) {
                throw new MissingConfigError(`adapters[${index}].${e.config}`)
            }
            return () => {}
        }
    })

    console.info(`Configured with Streamr: ${config.streamrUrl}`)
    console.info(`Network node running on ${config.network.hostname}:${config.network.port}`)
    console.info(`Adapters: ${JSON.stringify(config.adapters.map((a) => a.name))}`)

    return {
        close: () => {
            closeAdapterFns.forEach((close) => close())
        },
    }
}
