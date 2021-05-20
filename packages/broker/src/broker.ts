import { startNetworkNode, startStorageNode, Protocol, MetricsContext } from 'streamr-network'
import StreamrClient from 'streamr-client'
import publicIp from 'public-ip'
import { Wallet } from 'ethers'
import { Logger } from 'streamr-network'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { startCassandraStorage } from './storage/Storage'
import { Publisher } from './Publisher'
import { VolumeLogger } from './VolumeLogger'
import { SubscriptionManager } from './SubscriptionManager'
import { createPlugin } from './pluginRegistry'
import { validateConfig } from './helpers/validateConfig'
import { Storage } from './storage/Storage'
import { StorageConfig } from './storage/StorageConfig'
import { version as CURRENT_VERSION } from '../package.json'
import { Todo } from './types'
import { Config, TrackerRegistry } from './config'
import { Plugin, PluginOptions } from './Plugin'
import { startServer as startHttpServer, stopServer } from './httpServer'
const { Utils } = Protocol

const logger = new Logger(module)

export interface Broker {
    getNeighbors: () => readonly string[]
    getStreams: () => readonly string[]
    close: () => Promise<unknown>
}

export const startBroker = async (config: Config): Promise<Broker> => {
    validateConfig(config)

    logger.info(`Starting broker version ${CURRENT_VERSION}`)

    const networkNodeName = config.network.name
    const metricsContext = new MetricsContext(networkNodeName)
    const storages: Todo[] = []

    // Ethereum wallet retrieval
    const wallet = new Wallet(config.ethereumPrivateKey)
    if (!wallet) {
        throw new Error('Could not resolve Ethereum address from given config.ethereumPrivateKey')
    }
    const brokerAddress = wallet.address

    const createStorageConfig = async () => {
        return StorageConfig.createInstance(brokerAddress, config.streamrUrl + '/api/v1', config.storageConfig!.refreshInterval)
    }

    const storageConfig = config.network.isStorageNode ? await createStorageConfig() : null

    let cassandraStorage: Storage
    // Start cassandra storage
    if (config.cassandra) {
        logger.info(`Starting Cassandra with hosts ${config.cassandra.hosts} and keyspace ${config.cassandra.keyspace}`)
        cassandraStorage = await startCassandraStorage({
            contactPoints: [...config.cassandra.hosts],
            localDataCenter: config.cassandra.datacenter,
            keyspace: config.cassandra.keyspace,
            username: config.cassandra.username,
            password: config.cassandra.password,
            opts: {
                useTtl: !config.network.isStorageNode
            },
            storageConfig: storageConfig!
        })
        cassandraStorage.enableMetrics(metricsContext)
        storages.push(cassandraStorage)
    } else {
        logger.info('Cassandra disabled')
    }

    // Form tracker list
    let trackers: string[]
    if ((config.network.trackers as TrackerRegistry).registryAddress) {
        const registry = await Protocol.Utils.getTrackerRegistryFromContract({
            contractAddress: (config.network.trackers as TrackerRegistry).registryAddress,
            jsonRpcProvider: (config.network.trackers as TrackerRegistry).jsonRpcProvider
        })
        trackers = registry.getAllTrackers().map((record) => record.ws)
    } else {
        trackers = config.network.trackers as string[]
    }

    // Start network node
    const startFn = config.network.isStorageNode ? startStorageNode : startNetworkNode
    const advertisedWsUrl = config.network.advertisedWsUrl !== 'auto'
        ? config.network.advertisedWsUrl
        : await publicIp.v4().then((ip) => `ws://${ip}:${config.network.port}`)
    const networkNode = await startFn({
        host: config.network.hostname,
        port: config.network.port,
        id: brokerAddress,
        name: networkNodeName,
        trackers,
        storages,
        // @ts-expect-error
        storageConfig,
        advertisedWsUrl,
        location: config.network.location,
        metricsContext
    })
    networkNode.start()

    if ((storageConfig !== null) && (config.streamrAddress !== null)) {
        storageConfig.startAssignmentEventListener(config.streamrAddress, networkNode)
    }

    // Set up reporting to Streamr stream
    let client: StreamrClient | undefined
    let legacyStreamId: string | undefined

    if (config.reporting.streamr || (config.reporting.perNodeMetrics && config.reporting.perNodeMetrics.enabled)) {
        client = new StreamrClient({
            auth: {
                privateKey: config.ethereumPrivateKey,
            },
            url: config.reporting.perNodeMetrics ? (config.reporting.perNodeMetrics.wsUrl || undefined) : undefined,
            restUrl: config.reporting.perNodeMetrics ? (config.reporting.perNodeMetrics.httpUrl || undefined) : undefined
        })

        if (config.reporting.streamr && config.reporting.streamr.streamId) {
            const { streamId } = config.reporting.streamr
            legacyStreamId = streamId
            logger.info(`Starting StreamrClient reporting with streamId: ${streamId}`)
        } else {
            logger.info('StreamrClient reporting disabled')
        }
    } else {
        logger.info('StreamrClient and perNodeMetrics disabled')
    }

    // Validator only needs public information, so use unauthenticated client for that
    const unauthenticatedClient = new StreamrClient({
        restUrl: config.streamrUrl + '/api/v1',
    })
    const streamMessageValidator = new Utils.CachingStreamMessageValidator({
        getStream: (sId) => unauthenticatedClient.getStreamValidationInfo(sId),
        isPublisher: (address, sId) => unauthenticatedClient.isStreamPublisher(sId, address),
        isSubscriber: (address, sId) => unauthenticatedClient.isStreamSubscriber(sId, address),
    })
    const publisher = new Publisher(networkNode, streamMessageValidator, metricsContext)
    const subscriptionManager = new SubscriptionManager(networkNode)

    const plugins: Plugin<any>[] = config.plugins.map(({ name, ...pluginConfig }) => {
        const pluginOptions: PluginOptions<any> = {
            networkNode,
            subscriptionManager,
            publisher,
            metricsContext,
            cassandraStorage,
            storageConfig,
            config,
            pluginConfig,
        }
        return createPlugin(name, pluginOptions)
    })

    await Promise.all(plugins.map((plugin) => plugin.start()))
    const httpServerRoutes = plugins.flatMap((plugin) => plugin.getHttpServerRoutes())
    let httpServer: HttpServer|HttpsServer|undefined
    if (httpServerRoutes.length > 0) {
        if (config.httpServer === null) {
            throw new Error('HTTP server config not defined')
        }
        httpServer = await startHttpServer(httpServerRoutes, config.httpServer)
    }

    let reportingIntervals
    let storageNodeAddress

    if (config.reporting && config.reporting.perNodeMetrics && config.reporting.perNodeMetrics.intervals) {
        reportingIntervals = config.reporting.perNodeMetrics.intervals
        storageNodeAddress = config.reporting.perNodeMetrics.storageNode
    }

    // Start logging facilities
    const volumeLogger = new VolumeLogger(
        config.reporting.intervalInSeconds,
        metricsContext,
        client,
        legacyStreamId,
        brokerAddress,
        reportingIntervals,
        storageNodeAddress
    )
    await volumeLogger.start()

    logger.info(`Network node '${networkNodeName}' running on ${config.network.hostname}:${config.network.port}`)
    logger.info(`Ethereum address ${brokerAddress}`)
    logger.info(`Configured with trackers: ${trackers.join(', ')}`)
    logger.info(`Configured with Streamr: ${config.streamrUrl}`)
    logger.info(`Plugins: ${JSON.stringify(config.plugins.map((a: Todo) => a.name))}`)
    if (config.cassandra) {
        logger.info(`Configured with Cassandra: hosts=${config.cassandra.hosts} and keyspace=${config.cassandra.keyspace}`)
    }
    if (advertisedWsUrl) {
        logger.info(`Advertising to tracker WS url: ${advertisedWsUrl}`)
    }

    return {
        getNeighbors: () => networkNode.getNeighbors(),
        getStreams: () => networkNode.getStreams(),
        close: () => Promise.all([
            networkNode.stop(),
            ...plugins.map((plugin) => plugin.stop()),
            (httpServer !== undefined) ? stopServer(httpServer) : undefined,
            ...storages.map((storage) => storage.close()),
            volumeLogger.close(),
            (storageConfig !== null) ? storageConfig.cleanup() : undefined
        ])
    }
}

process.on('uncaughtException', (err) => {
    logger.getFinalLogger().error(err, 'uncaughtException')
    process.exit(1)
})

process.on('unhandledRejection', (err) => {
    logger.getFinalLogger().error(err, 'unhandledRejection')
    process.exit(1)
})
