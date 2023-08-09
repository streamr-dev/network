import { Logger, toEthereumAddress } from '@streamr/utils'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import get from 'lodash/get'
import has from 'lodash/has'
import isEqual from 'lodash/isEqual'
import set from 'lodash/set'
import StreamrClient, { NetworkNodeStub } from 'streamr-client'
import { version as CURRENT_VERSION } from '../package.json'
import { HttpServerEndpoint, Plugin } from './Plugin'
import { Config } from './config/config'
import BROKER_CONFIG_SCHEMA from './config/config.schema.json'
import { validateConfig } from './config/validateConfig'
import { generateMnemonicFromAddress } from './helpers/generateMnemonicFromAddress'
import { startServer as startHttpServer, stopServer } from './httpServer'
import { createPlugin } from './pluginRegistry'

const logger = new Logger(module)

export interface Broker {
    getNode: () => Promise<NetworkNodeStub>
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
}

export const createBroker = async (configWithoutDefaults: Config): Promise<Broker> => {
    const config = validateConfig(configWithoutDefaults, BROKER_CONFIG_SCHEMA)
    const plugins: Plugin<any>[] = Object.keys(config.plugins).map((name) => createPlugin(name, config))

    plugins.forEach((plugin) => {
        const clientConfig = plugin.getClientConfig()
        clientConfig.forEach((item) => {
            if (!has(config.client, item.path)) {
                set(config.client, item.path, item.value)
            } else {
                const existingValue = get(config.client, item.path)
                if (!isEqual(item.value, existingValue)) {
                    throw new Error(`Plugin ${plugin.name} doesn't support client config value ${JSON.stringify(item.value)} in ${item.path}`)
                }
            }
        })
    })
    const streamrClient = new StreamrClient(config.client)

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
            await Promise.all(plugins.map((plugin) => plugin.start(streamrClient)))
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

            logger.info(`Plugins: ${JSON.stringify(plugins.map((p) => p.name))}`)

            if (!config.client.network?.controlLayer?.webrtcAllowPrivateAddresses) {
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
