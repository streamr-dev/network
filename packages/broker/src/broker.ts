import { Logger, toEthereumAddress } from '@streamr/utils'
import StreamrClient, { NetworkNodeStub } from 'streamr-client'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { createPlugin } from './pluginRegistry'
import { validateConfig } from './config/validateConfig'
import { version as CURRENT_VERSION } from '../package.json'
import { Config } from './config/config'
import { HttpServerEndpoint, Plugin, PluginOptions } from './Plugin'
import { startServer as startHttpServer, stopServer } from './httpServer'
import BROKER_CONFIG_SCHEMA from './config/config.schema.json'
import { generateMnemonicFromAddress } from './helpers/generateMnemonicFromAddress'

const logger = new Logger(module)

export interface Broker {
    getNode: () => Promise<NetworkNodeStub>
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
}

export const createBroker = async (configWithoutDefaults: Config): Promise<Broker> => {
    const config = validateConfig(configWithoutDefaults, BROKER_CONFIG_SCHEMA)
    const streamrClient = new StreamrClient(config.client)

    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => {
        const pluginOptions: PluginOptions = {
            name,
            streamrClient,
            brokerConfig: config
        }
        return createPlugin(name, pluginOptions)
    })

    let started = false
    let httpServer: HttpServer | HttpsServer | undefined

    const getNode = async (): Promise<NetworkNodeStub> => {
        if (!started) {
            throw new Error('cannot invoke on non-started broker')
        }
        return streamrClient.getNode()
    }

    return {
        getNode,
        start: async () => {
            logger.info(`Start broker version ${CURRENT_VERSION}`)
            await Promise.all(plugins.map((plugin) => plugin.start()))
            const httpServerEndpoints = plugins.flatMap((plugin: Plugin<any>) => {
                return plugin.getHttpServerEndpoints().map((endpoint: HttpServerEndpoint) => {
                    return { ...endpoint, apiAuthentication: plugin.getApiAuthentication() }
                })
            })
            if (httpServerEndpoints.length > 0) {
                httpServer = await startHttpServer(httpServerEndpoints, config.httpServer)
            }

            const nodeId = (await streamrClient.getNode()).getNodeId()
            const brokerAddress = await streamrClient.getAddress()
            const mnemonic = generateMnemonicFromAddress(toEthereumAddress(brokerAddress))

            logger.info(`Welcome to the Streamr Network. Your node's generated name is ${mnemonic}.`)
            logger.info(`View your node in the Network Explorer: https://streamr.network/network-explorer/nodes/${encodeURIComponent(nodeId)}`)
            logger.info(`Network node ${nodeId} running`)
            logger.info(`Ethereum address ${brokerAddress}`)
            logger.info(`Tracker Configuration: ${config.client.network?.trackers ? JSON.stringify(config.client.network?.trackers) : 'default'}`)

            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)

            if (config.client.network?.webrtcDisallowPrivateAddresses === undefined || config.client.network.webrtcDisallowPrivateAddresses) {
                logger.warn('WebRTC private address probing is disabled. ' +
                    'This makes it impossible to create network layer connections directly via local routers ' +
                    'More info: https://github.com/streamr-dev/network-monorepo/wiki/WebRTC-private-addresses')
            }
            started = true
        },
        stop: async () => {
            if (httpServer !== undefined) {
                await stopServer(httpServer)
            }
            await Promise.all(plugins.map((plugin) => plugin.stop()))
            await streamrClient.destroy()
        }
    }
}

process.on('uncaughtException', (err) => {
    logger.fatal( 'Encountered uncaughtException', { err })
    process.exit(1)
})

process.on('unhandledRejection', (err) => {
    logger.fatal('Encountered unhandledRejection', { err })
    process.exit(1)
})
