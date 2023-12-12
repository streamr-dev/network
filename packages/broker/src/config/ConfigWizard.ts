import { checkbox, confirm, input, password, select } from '@inquirer/prompts'
import { config as cfg } from '@streamr/config'
import { toEthereumAddress } from '@streamr/utils'
import chalk from 'chalk'
import { Wallet } from 'ethers'
import { isAddress } from 'ethers/lib/utils'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { produce } from 'immer'
import path from 'path'
import { z } from 'zod'
import {
    CURRENT_CONFIGURATION_VERSION,
    formSchemaUrl,
} from '../config/migration'
import { generateMnemonicFromAddress } from '../helpers/generateMnemonicFromAddress'
import * as MqttConfigSchema from '../plugins/mqtt/config.schema.json'
import * as WebsocketConfigSchema from '../plugins/websocket/config.schema.json'
import * as BrokerConfigSchema from './config.schema.json'
import { ConfigFile, getDefaultFile } from './config'

export const start = async (): Promise<void> => {
    const logger = {
        info: (...args: any[]) => {
            console.info(chalk.bgGrey(' '), ...args)
        },
        error: (...args: any[]) => {
            console.error(chalk.bgRed.black('!'), ...args)
        },
    }

    console.info()

    logger.info()

    logger.info(' ', chalk.whiteBright.bold('Welcome to the Streamr Network!'))

    logger.info(' ', 'This Config Wizard will help you setup your node.')

    logger.info(' ', 'The steps are documented here:')

    logger.info(
        ' ',
        'https://docs.streamr.network/guides/how-to-run-streamr-node#config-wizard'
    )

    logger.info()

    console.info()

    try {
        const privateKey = await getPrivateKey()

        const network = await getNetwork()

        const operatorPlugins = await getOperatorPlugins()

        const { http, ...pubsubPlugins } = await getPubsubPlugins()

        if (http) {
            Object.assign(pubsubPlugins, {
                http: {},
            })
        }

        const storagePath = await getStoragePath()

        const httpServer = http?.port ? { port: http.port } : void 0

        const config: ConfigFile = {
            $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION),
            client: {
                auth: {
                    privateKey,
                },
            },
            plugins: {
                ...operatorPlugins,
                ...pubsubPlugins,
            },
            httpServer,
        }

        persistConfig(
            storagePath,
            network === 'polygon' ? config : getMumbaiConfig(config)
        )

        console.info()

        logger.info()


        logger.info(
            chalk.greenBright('✓'),
            chalk.bold.whiteBright(
                `Congratulations, you've set up your Streamr Network node!`
            )
        )

        logger.info(
            ` `,
            `Your node address is ${chalk.greenBright(
                new Wallet(privateKey).address
            )}`
        )

        logger.info(
            ` `,
            `Your node's generated name is ${chalk.greenBright(
                getNodeMnemonic(privateKey)
            )}`
        )

        logger.info()

        logger.info(` `, `You can start your Streamr node now with`)

        logger.info(` `, chalk.whiteBright(`streamr-broker ${storagePath}`))

        logger.info()

        logger.info(` `, `For environment specific run instructions, see`)

        logger.info(
            ` `,
            `https://docs.streamr.network/guides/how-to-run-streamr-node`
        )

        logger.info()

        console.info()
    } catch (e: any) {
        if (typeof e.message === 'string' && /force closed/i.test(e.message)) {
            return
        }

        throw e
    }
}

/**
 * Generates a mnemonic for a given private key.
 */
export const getNodeMnemonic = (privateKey: string): string => {
    return generateMnemonicFromAddress(
        toEthereumAddress(new Wallet(privateKey).address)
    )
}

/**
 * Lets the user generate a private key or import an existing private key.
 */
async function getPrivateKey() {
    const privateKeySource = await select<'Generate' | 'Import'>({
        message:
            'Do you want to generate a new Ethereum private key or import an existing one?',
        choices: [{ value: 'Generate' }, { value: 'Import' }],
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
                } catch (_) {
                    return 'Invalid private key provided.'
                }
            },
        })
    })()

    if (privateKeySource === 'Generate') {
        await confirm({
            message:
                // eslint-disable-next-line max-len
                'We strongly recommend backing up your private key. It will be written into the config file, but would you also like to see this sensitive information on screen now?',
            default: false,
            transformer(value) {
                return value ? `Your node's private key: ${privateKey}` : 'no'
            },
        })
    }

    return privateKey
}

/**
 * Lets the user decide the desired network for their node.
 */
async function getNetwork() {
    return select<'polygon' | 'mumbai'>({
        message:
            'Which network do you want to configure your node to connect to?',
        choices: [
            { value: 'polygon', name: 'Streamr 1.0 testnet + Polygon' },
            {
                value: 'mumbai',
                name: 'Streamr 1.0 testing environment + Mumbai',
            },
        ],
        default: 'polygon',
    })
}

/**
 * Lets the user gather and configure desired operator plugins.
 */
async function getOperatorPlugins() {
    const setupOperator = await confirm({
        message:
            'Do you wish to participate in earning rewards by staking on stream Sponsorships?',
        default: true,
    })

    if (!setupOperator) {
        return {}
    }

    return {
        operator: {
            operatorContractAddress: await input({
                message: 'Enter your Operator address:',
                validate(value) {
                    return isAddress(value) ? true : 'Invalid ethereum address'
                },
            }),
        },
    }
}

interface PubsubPlugin {
    port?: number
}

type PubsubPluginKey = 'websocket' | 'mqtt' | 'http'

const DefaultPort: Record<PubsubPluginKey, number> = {
    websocket: WebsocketConfigSchema.properties.port.default,
    mqtt: MqttConfigSchema.properties.port.default,
    http: BrokerConfigSchema.properties.httpServer.properties.port.default,
}

/**
 * Lets the user select and configure desired pub/sub plugins.
 */
async function getPubsubPlugins() {
    const setupPubsub = await confirm({
        message:
            'Do you wish to use your node for data publishing/subscribing?',
        default: true,
    })

    if (!setupPubsub) {
        return {}
    }

    const keys = await checkbox<PubsubPluginKey>({
        message: 'Select the plugins to enable',
        choices: [
            { value: 'websocket', name: 'WebSocket' },
            { value: 'mqtt', name: 'MQTT' },
            { value: 'http', name: 'HTTP' },
        ],
    })

    const pubsubPlugins: Partial<Record<PubsubPluginKey, PubsubPlugin>> = {}

    for (const key of keys) {
        const defaultPort = DefaultPort[key]

        const port = Number(
            await input({
                message: `Provide a port for the ${key} plugin`,
                default: defaultPort.toString(),
                validate(value) {
                    try {
                        return !!z.coerce
                            .number({
                                invalid_type_error:
                                    'Non-numeric value provided',
                            })
                            .int('Non-integer value provided')
                            .min(1024)
                            .max(49151)
                            .superRefine((value, ctx) => {
                                const [pluginKey] =
                                    Object.entries(pubsubPlugins).find(
                                        ([pluginKey, plugin]) =>
                                            value ===
                                            (plugin.port ||
                                                DefaultPort[
                                                    pluginKey as PubsubPluginKey
                                                ])
                                    ) || []

                                if (pluginKey) {
                                    ctx.addIssue({
                                        code: z.ZodIssueCode.custom,
                                        message: `Port ${value} is taken by ${pluginKey}`,
                                    })
                                }
                            })
                            .parse(value)
                    } catch (e: unknown) {
                        return (e as z.ZodError).issues
                            .map(({ message }) => message)
                            .join(', ')
                    }
                },
            })
        )

        pubsubPlugins[key] = port !== defaultPort ? { port } : {}
    }

    return pubsubPlugins
}

/**
 * Lets the user decide where to write the config file.
 */
async function getStoragePath() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const path = await input({
            message: 'Select a path to store the generated config in',
            default: getDefaultFile(),
        })

        const proceed =
            !existsSync(path) ||
            (await confirm({
                message: `The selected destination ${path} already exists. Do you want to overwrite it?`,
                default: false,
            }))

        if (proceed) {
            return path
        }
    }
}

/**
 * Writes given config structure into a file.
 */
function persistConfig(storagePath: string, config: ConfigFile) {
    const dirPath = path.dirname(storagePath)

    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, {
            recursive: true,
        })
    }

    writeFileSync(storagePath, JSON.stringify(config, null, 4))

    chmodSync(storagePath, '600')
}

/**
 * Adjusts the given config for the Mumbai test environment.
 */
function getMumbaiConfig(config: ConfigFile): ConfigFile {
    return produce(config, (draft) => {
        if (!draft.client) {
            draft.client = {}
        }

        draft.client.metrics = false

        const {
            id: chainId,
            entryPoints,
            theGraphUrl,
            rpcEndpoints: rpcs,
        } = cfg.mumbai

        draft.client.network = {
            controlLayer: {
                entryPoints,
            },
        }

        const {
            StreamRegistry: streamRegistryChainAddress,
            StreamStorageRegistry: streamStorageRegistryChainAddress,
            StorageNodeRegistry: storageNodeRegistryChainAddress,
        } = cfg.mumbai.contracts

        draft.client.contracts = {
            streamRegistryChainAddress,
            streamStorageRegistryChainAddress,
            storageNodeRegistryChainAddress,
            streamRegistryChainRPCs: {
                name: 'mumbai',
                chainId,
                rpcs,
            },
            theGraphUrl,
        }
    })
}
