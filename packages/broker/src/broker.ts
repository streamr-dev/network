import { Logger } from 'streamr-network'
import StreamrClient, { validateConfig as validateClientConfig, NetworkNodeStub } from 'streamr-client'
import * as Protocol from 'streamr-client-protocol'
import { Wallet } from 'ethers'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { createPlugin } from './pluginRegistry'
import { validateConfig } from './config/validateConfig'
import { version as CURRENT_VERSION } from '../package.json'
import { Config } from './config/config'
import { Plugin, PluginOptions } from './Plugin'
import { startServer as startHttpServer, stopServer } from './httpServer'
import BROKER_CONFIG_SCHEMA from './config/config.schema.json'
import { createApiAuthenticator } from './apiAuthenticator'

const logger = new Logger(module)

export interface Broker {
    getNode: () => Promise<NetworkNodeStub>
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
}

const getNameDescription = (name: string|undefined, id: string) => {
    return (name !== undefined) ? `${name} (id=${id})` : id
}

export const createBroker = async (config: Config): Promise<Broker> => {
    validateConfig(config, BROKER_CONFIG_SCHEMA)
    validateClientConfig(config.client)

    const wallet = new Wallet(config.client.auth!.privateKey!)
    const brokerAddress = wallet.address

    const streamrClient = new StreamrClient(config.client)
    const apiAuthenticator = createApiAuthenticator(config)

    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => {
        const pluginOptions: PluginOptions = {
            name,
            streamrClient,
            apiAuthenticator,
            brokerConfig: config
        }
        return createPlugin(name, pluginOptions)
    })

    let httpServer: HttpServer|HttpsServer|undefined

    return {
        start: async () => {
            logger.info(`Starting broker version ${CURRENT_VERSION}`)
            await Promise.all(plugins.map((plugin) => plugin.start()))
            const httpServerRoutes = plugins.flatMap((plugin) => plugin.getHttpServerRoutes())
            if (httpServerRoutes.length > 0) {
                httpServer = await startHttpServer(httpServerRoutes, config.httpServer, apiAuthenticator)
            }

            const nodeId = (await streamrClient.getNode()).getNodeId()

            logger.info(`Welcome to the Streamr Network. Your node's generated name is ${Protocol.generateMnemonicFromAddress(brokerAddress)}.`)
            logger.info(`View your node in the Network Explorer: https://streamr.network/network-explorer/nodes/${encodeURIComponent(nodeId)}`)
            logger.info(`Network node ${getNameDescription(config.client.network?.name, nodeId)} running`)
            logger.info(`Ethereum address ${brokerAddress}`)
            logger.info(`Tracker Configuration: ${
                config.client.network?.trackers ? JSON.stringify(config.client.network?.trackers) : 'default'
            }`)

            if (config.client.restUrl !== undefined) {
                logger.info(`Configured with Streamr: ${config.client.restUrl}`)
            }
            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)

            if (config.client.network?.webrtcDisallowPrivateAddresses === undefined || config.client.network.webrtcDisallowPrivateAddresses) {
                logger.warn('WebRTC private address probing is disabled. ' +
                    'This makes it impossible to create network layer connections directly via local routers ' +
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
        },
        getNode: async () => {
            return streamrClient.getNode()
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
