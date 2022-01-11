import { Logger } from 'streamr-network'
import StreamrClient, { validateConfig as validateClientConfig} from 'streamr-client'
import * as Protocol from 'streamr-client-protocol'
import { Wallet } from 'ethers'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { createPlugin } from './pluginRegistry'
import { validateConfig } from './helpers/validateConfig'
import { version as CURRENT_VERSION } from '../package.json'
import { ClientConfig, Config, NetworkSmartContract } from './config'
import { Plugin, PluginOptions } from './Plugin'
import { startServer as startHttpServer, stopServer } from './httpServer'
import BROKER_CONFIG_SCHEMA from './helpers/config.schema.json'
import { createApiAuthenticator } from './apiAuthenticator'

const logger = new Logger(module)

export interface Broker {
    getNeighbors: () => readonly string[]
    getSPIDs: () => Iterable<Protocol.SPID>
    getNodeId: () => string
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
}

const transformClientConfig = async (config: ClientConfig) => {
    const trackerConfig = config.network?.trackers
    if ((trackerConfig as NetworkSmartContract)?.contractAddress !== undefined) {
        const registry = await Protocol.Utils.getTrackerRegistryFromContract({
            contractAddress: (trackerConfig as NetworkSmartContract).contractAddress,
            jsonRpcProvider: (trackerConfig as NetworkSmartContract).jsonRpcProvider
        })
        config.network!.trackers = registry.getAllTrackers()
    }
}

const getNameDescription = (name: string|undefined, id: string) => {
    return (name !== undefined) ? `${name} (id=${id})` : id
}

export const createBroker = async (config: Config): Promise<Broker> => {
    validateConfig(config, BROKER_CONFIG_SCHEMA)
    await transformClientConfig(config.client)
    validateClientConfig(config.client)

    const wallet = new Wallet(config.client.auth!.privateKey!)
    const brokerAddress = wallet.address

    const streamrClient = new StreamrClient(config.client)
    const networkNode = await streamrClient.getNode()
    const nodeId = networkNode.getNodeId()
    const apiAuthenticator = createApiAuthenticator(config)

    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => {
        const pluginOptions: PluginOptions = {
            name,
            networkNode,
            streamrClient,
            apiAuthenticator,
            brokerConfig: config,
            nodeId,
        }
        return createPlugin(name, pluginOptions)
    })

    let httpServer: HttpServer|HttpsServer|undefined

    return {
        getNeighbors: () => networkNode.getNeighbors(),
        getSPIDs: () => networkNode.getSPIDs(),
        getNodeId: () => networkNode.getNodeId(),
        start: async () => {
            logger.info(`Starting broker version ${CURRENT_VERSION}`)
            await Promise.all(plugins.map((plugin) => plugin.start()))
            const httpServerRoutes = plugins.flatMap((plugin) => plugin.getHttpServerRoutes())
            if (httpServerRoutes.length > 0) {
                httpServer = await startHttpServer(httpServerRoutes, config.httpServer, apiAuthenticator)
            }

            logger.info(`Welcome to the Streamr Network. Your node's generated name is ${Protocol.generateMnemonicFromAddress(brokerAddress)}.`)
            logger.info(`View your node in the Network Explorer: https://streamr.network/network-explorer/nodes/${brokerAddress}`)

            logger.info(`Network node ${getNameDescription(config.client.network?.name, nodeId)} running`)
            logger.info(`Ethereum address ${brokerAddress}`)
            if (config.client.network?.trackers !== undefined) {
                logger.info(`Configured with trackers: [${config.client.network.trackers.map((tracker) => tracker.http).join(', ')}]`)
            }
            if (config.client.restUrl !== undefined) {
                logger.info(`Configured with Streamr: ${config.client.restUrl}`)
            }
            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)

            if (!config.client.network?.webrtcDisallowPrivateAddresses) {
                logger.warn('WebRTC private address probing is allowed. ' +
                    'This can trigger false-positives for port scanning detection on some web hosts. ' +
                    'More info: https://github.com/streamr-dev/network-monorepo/wiki/WebRTC-private-addresses')
            }
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
