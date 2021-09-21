import { Protocol, MetricsContext } from 'streamr-network'
import StreamrClient, { StorageNode } from 'streamr-client'
import { Wallet } from 'ethers'
import { Logger } from 'streamr-network'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { Publisher } from './Publisher'
import { SubscriptionManager } from './SubscriptionManager'
import { createPlugin } from './pluginRegistry'
import { validateConfig } from './helpers/validateConfig'
import { version as CURRENT_VERSION } from '../package.json'
import { Config, NetworkSmartContract, TrackerRegistryItem } from './config'
import { Plugin, PluginOptions } from './Plugin'
import { startServer as startHttpServer, stopServer } from './httpServer'
import BROKER_CONFIG_SCHEMA from './helpers/config.schema.json'
import { createApiAuthenticator } from './apiAuthenticator'
import { v4 as uuidv4 } from 'uuid'

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

// const getStorageNodes = async (config: Config): Promise<StorageNodeRegistryItem[]> => {
//     if ((config.storageNodeConfig.registry as NetworkSmartContract).contractAddress) {
//         const registry = await Protocol.Utils.getStorageNodeRegistryFromContract({
//             contractAddress: (config.storageNodeConfig.registry as NetworkSmartContract).contractAddress,
//             jsonRpcProvider: (config.storageNodeConfig.registry as NetworkSmartContract).jsonRpcProvider
//         })
//         return registry.getAllStorageNodes()
//     } else {
//         return config.storageNodeConfig.registry as StorageNodeRegistryItem[]
//     }
// }

const getStunTurnUrls = (config: Config): string[] | undefined => {
    if (!config.network.stun && !config.network.turn) {
        return undefined
    }
    const urls = []
    if (config.network.stun) {
        urls.push(config.network.stun)
    }
    if (config.network.turn) {
        const parsedUrl = config.network.turn.url.replace('turn:', '')
        const turn = `turn:${config.network.turn.username}:${config.network.turn.password}@${parsedUrl}`
        urls.push(turn)
    }
    return urls
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

    // Start network node
    let sessionId
    if (config.generateSessionId && !config.plugins['storage']) { // Exception: storage node needs consistent id
        sessionId = `${brokerAddress}#${uuidv4()}`
    }
    const nodeId = sessionId || brokerAddress
    const streamrClient = new StreamrClient({
        auth: {
            privateKey: config.ethereumPrivateKey,
        },
        restUrl: `${config.streamrUrl}/api/v1`,
        storageNodeRegistry: config.storageNodeConfig?.registry,
        network: {
            id: nodeId,
            name: networkNodeName,
            trackers,
            location: config.network.location,
            metricsContext,
            stunUrls: getStunTurnUrls(config)
        }
    })
    const storageNodes = await streamrClient.getAllStorageNodes()
    const publisher = new Publisher(streamrClient, metricsContext)
    const networkNode = await streamrClient.getNode()
    const subscriptionManager = new SubscriptionManager(networkNode)
    const apiAuthenticator = createApiAuthenticator(config)

    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => {
        const pluginOptions: PluginOptions = {
            name,
            networkNode,
            subscriptionManager,
            publisher,
            streamrClient,
            apiAuthenticator,
            metricsContext,
            brokerConfig: config,
            nodeId
        }
        return createPlugin(name, pluginOptions)
    })

    let httpServer: HttpServer|HttpsServer|undefined

    return {
        getNeighbors: () => networkNode.getNeighbors(),
        getStreams: () => networkNode.getStreams(),
        start: async () => {
            logger.info(`Starting broker version ${CURRENT_VERSION}`)
            //await streamrClient.startNode()
            await Promise.all(plugins.map((plugin) => plugin.start()))
            const httpServerRoutes = plugins.flatMap((plugin) => plugin.getHttpServerRoutes())
            if (httpServerRoutes.length > 0) {
                httpServer = await startHttpServer(httpServerRoutes, config.httpServer, apiAuthenticator)
            }

            logger.info(`Welcome to the Streamr Network. Your node's generated name is ${Protocol.generateMnemonicFromAddress(brokerAddress)}.`)
            logger.info(`View your node in the Network Explorer: https://streamr.network/network-explorer/nodes/${brokerAddress}`)

            logger.info(`Network node '${networkNodeName}' (id=${nodeId}) running`)
            logger.info(`Ethereum address ${brokerAddress}`)
            logger.info(`Configured with trackers: [${trackers.map((tracker) => tracker.http).join(', ')}]`)
            logger.info(`Configured with Streamr: ${config.streamrUrl}`)
            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)
        },
        stop: async () => {
            if (httpServer !== undefined) {
                await stopServer(httpServer)
            }
            await Promise.all(plugins.map((plugin) => plugin.stop()))
            if (streamrClient !== undefined) {
                await streamrClient.destroy()
            }
            await networkNode.stop()
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
