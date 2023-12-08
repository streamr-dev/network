import { checkbox, confirm, input, password, select } from '@inquirer/prompts'
import { toEthereumAddress } from '@streamr/utils'
import chalk from 'chalk'
import { Wallet } from 'ethers'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import {
    CURRENT_CONFIGURATION_VERSION,
    formSchemaUrl
} from '../config/migration'
import { generateMnemonicFromAddress } from '../helpers/generateMnemonicFromAddress'
import * as MqttConfigSchema from '../plugins/mqtt/config.schema.json'
import * as WebsocketConfigSchema from '../plugins/websocket/config.schema.json'
import { ConfigFile, getDefaultFile } from './config'
import * as BrokerConfigSchema from './config.schema.json'

type Plugin = { port: number }

type PluginKey = 'websocket' | 'mqtt' | 'http'

const DefaultPort: Record<PluginKey, number> = {
    websocket: WebsocketConfigSchema.properties.port.default,
    mqtt: MqttConfigSchema.properties.port.default,
    http: BrokerConfigSchema.properties.httpServer.properties.port.default
}

export const start = async () => {
    const logger = {
        info: (...args: any[]) => {
            console.info(chalk.bgWhite.black(':'), ...args)
        },
        error: (...args: any[]) => {
            console.error(chalk.bgRed.black('!'), ...args)
        }
    }

    try {
        const privateKeySource = await select<'Generate' | 'Import'>({
            message:
                'Do you want to generate a new Ethereum private key or import an existing one?',
            choices: [{ value: 'Generate' }, { value: 'Import' }]
        })

        const privateKey = await (async () => {
            if (privateKeySource === 'Generate') {
                return Wallet.createRandom().privateKey
            }

            return password({
                message: 'Please provide the private key to import',
                validate(value) {
                    try {
                        return !!new Wallet(value)
                    } catch (_) {}

                    return 'Invalid private key provided.'
                }
            })
        })()

        if (privateKeySource === 'Generate') {
            await confirm({
                message:
                    'We strongly recommend backing up your private key.\nIt will be written into the config file, but would you also like to see this sensitive information on screen now?',
                default: false,
                transformer(value) {
                    return value
                        ? `Your node's private key: ${privateKey}`
                        : 'No'
                }
            })
        }

        const pluginKeys = await checkbox<PluginKey>({
            message: 'Select the plugins to enable',
            choices: [
                { value: 'websocket', name: 'WebSocket' },
                { value: 'mqtt', name: 'MQTT' },
                { value: 'http', name: 'HTTP' }
            ]
        })

        const enabledPlugins: Partial<Record<PluginKey, Plugin>> = {}

        for (const pluginKey of pluginKeys) {
            const defaultPort = DefaultPort[pluginKey]

            const port = Number(
                await input({
                    message: `Provide a port for the ${pluginKey} plugin`,
                    default: defaultPort.toString(),
                    validate(value) {
                        try {
                            return !!z.coerce
                                .number({
                                    invalid_type_error:
                                        'Non-numeric value provided'
                                })
                                .int('Non-integer value provided')
                                .min(1024)
                                .max(49151)
                                .parse(value)
                        } catch (e: unknown) {
                            return (e as z.ZodError).issues
                                .map(({ message }) => message)
                                .join(', ')
                        }
                    }
                })
            )

            if (port !== defaultPort) {
                enabledPlugins[pluginKey] = { port }
            }
        }

        const { http: httpServer, ...plugins } = enabledPlugins

        if (httpServer) {
            Object.assign(plugins, {
                http: {}
            })
        }

        const storagePath = await (async () => {
            while (true) {
                const path = await input({
                    message: 'Select a path to store the generated config in',
                    default: getDefaultFile()
                })

                const proceed =
                    !existsSync(path) ||
                    (await confirm({
                        message: `The selected destination ${path} already exists. Do you want to overwrite it?`,
                        default: false
                    }))

                if (proceed) {
                    return path
                }
            }
        })()

        const apiKey = Buffer.from(uuid().replace(/-/g, ''))
            .toString('base64')
            .replace(/[^\da-z]/gi, '')

        const config: ConfigFile = {
            $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION),
            client: {
                auth: {
                    privateKey
                }
            },
            plugins,
            apiAuthentication: {
                keys: [apiKey]
            },
            httpServer
        }

        const dirPath = path.dirname(storagePath)

        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, {
                recursive: true
            })
        }

        writeFileSync(storagePath, JSON.stringify(config, null, 4))

        chmodSync(storagePath, '600')

        logger.info('Welcome to the Streamr Network')

        logger.info(
            `Your node's generated name is ${getNodeMnemonic(privateKey)}.`
        )

        logger.info('You can start the broker now with')

        logger.info(`streamr-broker ${storagePath}`)
    } catch (e: any) {
        if (/force closed/i.test(e.message)) {
            return
        }

        logger.error(
            `Streamr Node Config Wizard encountered an error:\n${e.message}`
        )
    }
}

export const getNodeMnemonic = (privateKey: string): string => {
    return generateMnemonicFromAddress(
        toEthereumAddress(new Wallet(privateKey).address)
    )
}
