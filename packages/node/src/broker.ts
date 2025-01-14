import { Logger, toEthereumAddress } from '@streamr/utils'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import StreamrClient from '@streamr/sdk'
import { version as CURRENT_VERSION } from '../package.json'
import { HttpServerEndpoint, Plugin } from './Plugin'
import { Config } from './config/config'
import BROKER_CONFIG_SCHEMA from './config/config.schema.json'
import { validateConfig } from './config/validateConfig'
import { applyPluginClientConfigs } from './helpers/applyPluginClientConfigs'
import { generateMnemonicFromAddress } from './helpers/generateMnemonicFromAddress'
import { startServer as startHttpServer, stopServer } from './httpServer'
import { createPlugin } from './pluginRegistry'

const logger = new Logger(module)

export interface Broker {
    getStreamrClient: () => StreamrClient
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
}

export const createBroker = async (configWithoutDefaults: Config): Promise<Broker> => {
    const config = validateConfig(configWithoutDefaults, BROKER_CONFIG_SCHEMA)
    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => createPlugin(name, config))
    applyPluginClientConfigs(plugins, config.client)
    const streamrClient = new StreamrClient({
        ...config.client,
        network: {
            ...config.client.network,
            controlLayer: {
                ...config.client.network?.controlLayer,
                // TODO: more cleaner solution?
                geoIpDatabaseFolder:
                    config.client.network?.controlLayer?.geoIpDatabaseFolder ?? '~/.streamr/geoipdatabases'
            }
        }
    })

    let httpServer: HttpServer | HttpsServer | undefined

    return {
        getStreamrClient: () => {
            return streamrClient
        },
        start: async () => {
            logger.info(`Start Streamr node version ${CURRENT_VERSION}`)
            await Promise.all(plugins.map((plugin) => plugin.start(streamrClient)))
            const httpServerEndpoints = plugins.flatMap((plugin: Plugin<any>) => {
                return plugin.getHttpServerEndpoints().map((endpoint: HttpServerEndpoint) => {
                    return { ...endpoint, apiAuthentication: plugin.getApiAuthentication() }
                })
            })
            if (httpServerEndpoints.length > 0) {
                httpServer = await startHttpServer(httpServerEndpoints, config.httpServer)
            }
            const nodeId = await streamrClient.getNodeId()
            const brokerAddress = toEthereumAddress(await streamrClient.getUserId())
            const mnemonic = generateMnemonicFromAddress(toEthereumAddress(brokerAddress))

            logger.info(`Welcome to the Streamr Network. Your node's generated name is ${mnemonic}.`)
            logger.info(`Network node ${nodeId} running`)
            logger.info(`Node address ${brokerAddress}`)

            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)

            if (!config.client.network?.controlLayer?.webrtcAllowPrivateAddresses) {
                logger.warn(
                    'WebRTC private address probing is disabled. ' +
                        'This makes it impossible to create network layer connections directly via local routers ' +
                        'More info: https://github.com/streamr-dev/network-monorepo/wiki/WebRTC-private-addresses'
                )
            }
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
    logger.fatal('Encountered uncaughtException', { err })
    process.exit(1)
})

process.on('unhandledRejection', (err) => {
    logger.fatal('Encountered unhandledRejection', { err })
    process.exit(1)
})
