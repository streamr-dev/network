import { createNetworkNode, Protocol, MetricsContext } from 'streamr-network'
import StreamrClient from 'streamr-client'
import { Wallet } from 'ethers'
import { Logger } from 'streamr-network'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { Publisher } from './Publisher'
import { VolumeLogger } from './VolumeLogger'
import { SubscriptionManager } from './SubscriptionManager'
import { createPlugin } from './pluginRegistry'
import { validateConfig } from './helpers/validateConfig'
import { version as CURRENT_VERSION } from '../package.json'
import { Config, NetworkSmartContract, StorageNodeRegistryItem, TrackerRegistryItem } from './config'
import { Plugin, PluginOptions } from './Plugin'
import { startServer as startHttpServer, stopServer } from './httpServer'
import BROKER_CONFIG_SCHEMA from './helpers/config.schema.json'
import { createLocalStreamrClient } from './localStreamrClient'
import { createApiAuthenticator } from './apiAuthenticator'
import { StorageNodeRegistry } from "./StorageNodeRegistry"
import { v4 as uuidv4 } from 'uuid'
const { Utils } = Protocol

const logger = new Logger(module)

export interface Broker {
    getNeighbors: () => readonly string[]
    getStreams: () => readonly string[]
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
}

const getTrackers = async (config: Config): Promise<TrackerRegistryItem[]> => {
    if ((config.network.trackers as NetworkSmartContract).contractAddress) {
        const registry = await Protocol.Utils.getTrackerRegistryFromContract({
            contractAddress: (config.network.trackers as NetworkSmartContract).contractAddress,
            jsonRpcProvider: (config.network.trackers as NetworkSmartContract).jsonRpcProvider
        })
        return registry.getAllTrackers()
    } else {
        return config.network.trackers as TrackerRegistryItem[]
    }
}

const getStorageNodes = async (config: Config): Promise<StorageNodeRegistryItem[]> => {
    if ((config.storageNodeConfig.registry as NetworkSmartContract).contractAddress) {
        const registry = await Protocol.Utils.getStorageNodeRegistryFromContract({
            contractAddress: (config.storageNodeConfig.registry as NetworkSmartContract).contractAddress,
            jsonRpcProvider: (config.storageNodeConfig.registry as NetworkSmartContract).jsonRpcProvider
        })
        return registry.getAllStorageNodes()
    } else {
        return config.storageNodeConfig.registry as StorageNodeRegistryItem[]
    }
}

const createStreamMessageValidator = (config: Config): Protocol.StreamMessageValidator => {
    // Validator only needs public information, so use unauthenticated client for that
    const unauthenticatedClient = new StreamrClient({
        restUrl: config.streamrUrl + '/api/v1',
    })
    return new Utils.CachingStreamMessageValidator({
        getStream: (sId) => unauthenticatedClient.getStreamValidationInfo(sId),
        isPublisher: (address, sId) => unauthenticatedClient.isStreamPublisher(sId, address),
        isSubscriber: (address, sId) => unauthenticatedClient.isStreamSubscriber(sId, address),
    })
}

const createVolumeLogger = (
    config: Config,
    metricsContext: MetricsContext,
    brokerAddress: string,
    storageNodes: StorageNodeRegistryItem[]
): VolumeLogger => {
    // Set up reporting to Streamr stream
    let client: StreamrClient | undefined
    let legacyStreamId: string | undefined
    if (config.reporting.streamr || (config.reporting.perNodeMetrics && config.reporting.perNodeMetrics.enabled)) {
        const targetStorageNode = config.reporting.perNodeMetrics!.storageNode
        const storageNodeRegistryItem = storageNodes.find((n) => n.address === targetStorageNode)
        if (storageNodeRegistryItem === undefined) {
            throw new Error(`Value ${storageNodeRegistryItem} (config.reporting.perNodeMetrics.storageNode) not ` +
                'present in config.storageNodeRegistry')
        }
        client = new StreamrClient({
            auth: {
                privateKey: config.ethereumPrivateKey,
            },
            url: config.reporting.perNodeMetrics ? (config.reporting.perNodeMetrics.wsUrl || undefined) : undefined,
            restUrl: config.reporting.perNodeMetrics ? (config.reporting.perNodeMetrics.httpUrl || undefined) : undefined,
            storageNode: storageNodeRegistryItem
        })

        if (config.reporting.streamr && config.reporting.streamr.streamId) {
            const { streamId } = config.reporting.streamr
            legacyStreamId = streamId
            logger.info(`Starting StreamrClient reporting with streamId: ${streamId}`)
        } else {
            logger.info('StreamrClient reporting disabled')
        }
    }

    let reportingIntervals
    let storageNodeAddress
    if (config.reporting && config.reporting.perNodeMetrics && config.reporting.perNodeMetrics.intervals) {
        reportingIntervals = config.reporting.perNodeMetrics.intervals
        storageNodeAddress = config.reporting.perNodeMetrics.storageNode
    }

    return new VolumeLogger(
        config.reporting.intervalInSeconds,
        metricsContext,
        client,
        legacyStreamId,
        brokerAddress,
        reportingIntervals,
        storageNodeAddress
    )
}

export const createBroker = async (config: Config): Promise<Broker> => {
    validateConfig(config, BROKER_CONFIG_SCHEMA)

    const networkNodeName = config.network.name
    const metricsContext = new MetricsContext(networkNodeName)

    // Ethereum wallet retrieval
    const wallet = new Wallet(config.ethereumPrivateKey)
    if (!wallet) {
        throw new Error('Could not resolve Ethereum address from given config.ethereumPrivateKey')
    }
    const brokerAddress = wallet.address

    const trackers = await getTrackers(config)

    const storageNodes = await getStorageNodes(config)
    const storageNodeRegistry = StorageNodeRegistry.createInstance(config, storageNodes)

    // Start network node
    let sessionId
    if (config.generateSessionId && !config.plugins['storage']) { // Exception: storage node needs consistent id
        sessionId = `${brokerAddress}#${uuidv4()}`
    }
    const nodeId = sessionId || brokerAddress

    const networkNode = createNetworkNode({
        id: nodeId,
        name: networkNodeName,
        trackers,
        location: config.network.location,
        metricsContext
    })

    const publisher = new Publisher(networkNode, createStreamMessageValidator(config), metricsContext)
    const subscriptionManager = new SubscriptionManager(networkNode)
    const localStreamrClient = createLocalStreamrClient(config)
    const apiAuthenticator = createApiAuthenticator(config)

    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => {
        const pluginOptions: PluginOptions = {
            name,
            networkNode,
            subscriptionManager,
            publisher,
            streamrClient: localStreamrClient,
            apiAuthenticator,
            metricsContext,
            brokerConfig: config,
            storageNodeRegistry,
            nodeId
        }
        return createPlugin(name, pluginOptions)
    })

    const volumeLogger = createVolumeLogger(config, metricsContext, brokerAddress, storageNodes)

    let httpServer: HttpServer|HttpsServer|undefined

    return {
        getNeighbors: () => networkNode.getNeighbors(),
        getStreams: () => networkNode.getStreams(),
        start: async () => {
            logger.info(`Starting broker version ${CURRENT_VERSION}`)
            await networkNode.start()
            await Promise.all(plugins.map((plugin) => plugin.start()))
            const httpServerRoutes = plugins.flatMap((plugin) => plugin.getHttpServerRoutes())
            if (httpServerRoutes.length > 0) {
                if (config.httpServer === null) {
                    throw new Error('HTTP server config not defined')
                }
                httpServer = await startHttpServer(httpServerRoutes, config.httpServer, apiAuthenticator)
            }
            await volumeLogger.start()
            logger.info(`Network node '${networkNodeName}' (id=${nodeId}) running`)
            logger.info(`Ethereum address ${brokerAddress}`)
            logger.info(`Configured with trackers: ${trackers.join(', ')}`)
            logger.info(`Configured with Streamr: ${config.streamrUrl}`)
            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)
        },
        stop: async () => {
            if (httpServer !== undefined) {
                await stopServer(httpServer)
            }
            await Promise.all(plugins.map((plugin) => plugin.stop()))
            if (localStreamrClient !== undefined) {
                await localStreamrClient.ensureDisconnected()
            }        
            await Promise.all([networkNode.stop(), volumeLogger.close()])
        }
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
