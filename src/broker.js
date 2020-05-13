const { startNetworkNode, startStorageNode } = require('streamr-network')
const StreamrClient = require('streamr-client')
const publicIp = require('public-ip')
const Sentry = require('@sentry/node')

const CURRENT_VERSION = require('../package.json').version

const StreamFetcher = require('./StreamFetcher')
const { startCassandraStorage } = require('./Storage')
const Publisher = require('./Publisher')
const VolumeLogger = require('./VolumeLogger')
const SubscriptionManager = require('./SubscriptionManager')
const MissingConfigError = require('./errors/MissingConfigError')
const adapterRegistry = require('./adapterRegistry')
const getTrackers = require('./helpers/getTrackers')
const validateConfig = require('./helpers/validateConfig')

module.exports = async (config) => {
    validateConfig(config)

    console.info(`Starting broker version ${CURRENT_VERSION}`)

    const storages = []

    // Start cassandra storage
    if (config.cassandra) {
        console.info(`Starting Cassandra with hosts ${config.cassandra.hosts} and keyspace ${config.cassandra.keyspace}`)
        storages.push(await startCassandraStorage({
            contactPoints: [...config.cassandra.hosts],
            localDataCenter: 'datacenter1',
            keyspace: config.cassandra.keyspace,
            username: config.cassandra.username,
            password: config.cassandra.password,
            useTtl: !config.network.isStorageNode
        }))
    } else {
        console.info('Cassandra disabled')
    }

    // Start network node
    const startFn = config.network.isStorageNode ? startStorageNode : startNetworkNode
    const advertisedWsUrl = config.network.advertisedWsUrl !== 'auto'
        ? config.network.advertisedWsUrl
        : await publicIp.v4().then((ip) => `ws://${ip}:${config.network.port}`)
    const networkNode = await startFn(
        config.network.hostname,
        config.network.port,
        config.network.id,
        storages,
        advertisedWsUrl
    )

    let trackers
    if (config.trackerRegistry) {
        trackers = await getTrackers(config.trackerRegistry.address, config.trackerRegistry.config, config.trackerRegistry.jsonRpcProvider)
    }

    // from smart contract
    if (trackers) {
        trackers.forEach((tracker) => networkNode.addBootstrapTracker(tracker))
    }

    // from config
    if (config.network.trackers) {
        config.network.trackers.forEach((tracker) => networkNode.addBootstrapTracker(tracker))
    }

    // Set up sentry logging
    if (config.sentry) {
        console.info('Starting Sentry with dns: %s', config.sentry)
        Sentry.init({
            dsn: config.sentry,
            integrations: [
                new Sentry.Integrations.Console({
                    levels: ['error']
                })
            ],
            environment: config.network.hostname,
            maxBreadcrumbs: 50,
            attachStacktrace: true,

        })

        Sentry.configureScope((scope) => {
            scope.setUser({
                id: config.network.id
            })
        })
    }

    // Set up reporting to Streamr stream
    let client
    const { apiKey, streamId } = config.reporting
    if (config.reporting && streamId !== undefined && apiKey !== undefined) {
        console.info(`Starting StreamrClient reporting with apiKey: ${apiKey} and streamId: ${streamId}`)
        client = new StreamrClient({
            auth: {
                apiKey
            },
            autoConnect: false
        })
    } else {
        console.info('StreamrClient reporting disabled')
    }

    // Initialize common utilities
    const volumeLogger = new VolumeLogger(
        config.reporting.reportingIntervalSeconds,
        networkNode,
        storages,
        client,
        streamId
    )
    const streamFetcher = new StreamFetcher(config.streamrUrl)
    const publisher = new Publisher(networkNode, volumeLogger)
    const subscriptionManager = new SubscriptionManager(networkNode)

    // Start up adapters one-by-one, storing their close functions for further use
    const closeAdapterFns = config.adapters.map(({ name, ...adapterConfig }, index) => {
        try {
            return adapterRegistry.startAdapter(name, adapterConfig, {
                networkNode,
                publisher,
                streamFetcher,
                volumeLogger,
                subscriptionManager
            })
        } catch (e) {
            if (e instanceof MissingConfigError) {
                throw new MissingConfigError(`adapters[${index}].${e.config}`)
            }
            return () => {}
        }
    })

    console.info(`Network node '${config.network.id}' running on ${config.network.hostname}:${config.network.port}`)
    console.info(`Configured with trackers: ${[...networkNode.bootstrapTrackerAddresses].join(', ')}`)
    console.info(`Adapters: ${JSON.stringify(config.adapters.map((a) => a.name))}`)
    if (config.cassandra) {
        console.info(`Configured with Cassandra: hosts=${config.cassandra.hosts} and keyspace=${config.cassandra.keyspace}`)
    }
    console.info(`Configured with Streamr: ${config.streamrUrl}`)
    if (advertisedWsUrl) {
        console.info(`Advertising to tracker WS url: ${advertisedWsUrl}`)
    }

    return {
        getStreams: () => networkNode.getStreams(),
        close: () => Promise.all([
            networkNode.stop(),
            ...closeAdapterFns.map((close) => close()),
            ...storages.map((storage) => storage.close()),
            volumeLogger.close()
        ])
    }
}
