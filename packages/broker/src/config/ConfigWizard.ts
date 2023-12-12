import { checkbox, confirm, input, password, select } from '@inquirer/prompts'
import { config as cfg, config } from '@streamr/config'
import { toEthereumAddress } from '@streamr/utils'
import chalk from 'chalk'
import { BigNumber, Wallet, providers, utils } from 'ethers'
import { isAddress } from 'ethers/lib/utils'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { produce } from 'immer'
import path from 'path'
import { z } from 'zod'
import { generateMnemonicFromAddress } from '../helpers/generateMnemonicFromAddress'
import * as MqttConfigSchema from '../plugins/mqtt/config.schema.json'
import * as WebsocketConfigSchema from '../plugins/websocket/config.schema.json'
import * as BrokerConfigSchema from './config.schema.json'
import { ConfigFile, getDefaultFile } from './config'

const MinBalance = utils.parseEther('0.1')

export const start = async (): Promise<void> => {
    function notify(...args: unknown[]) {
        console.info(chalk.bgGrey(' '), ...args)
    }

    console.info()

    notify()

    notify(' ', chalk.whiteBright.bold('Welcome to the Streamr Network!'))

    notify(' ', 'This Config Wizard will help you setup your node.')

    notify(' ', 'The steps are documented here:')

    notify(
        ' ',
        'https://docs.streamr.network/guides/how-to-run-streamr-node#config-wizard'
    )

    notify()

    console.info()

    try {
        const privateKey = await getPrivateKey()

        const nodeAddress = new Wallet(privateKey).address

        const network = await getNetwork()

        const operator = await getOperatorAddress()

        const operatorPlugins = operator
            ? {
                  operator: {
                      operatorContractAddress: operator,
                  },
              }
            : {}

        const { http, ...pubsubPlugins } = await getPubsubPlugins()

        if (http) {
            Object.assign(pubsubPlugins, {
                http: {},
            })
        }

        const storagePath = await getStoragePath()

        const httpServer = http?.port ? { port: http.port } : void 0

        const config: ConfigFile = {
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

        notify()

        notify(
            chalk.greenBright('✓'),
            chalk.bold.whiteBright(
                `Congratulations, you've setup your Streamr node!`
            )
        )

        notify(` `, `Your node address is ${chalk.greenBright(nodeAddress)}`)

        if (operator) {
            const resume = progress(
                (f) =>
                    `${chalk.bgGrey(
                        ' '
                    )}   Your node address has ${chalk.whiteBright(
                        `${chalk.gray(f)} MATIC`
                    )} ${chalk.gray(`– checking balance…`)}`
            )

            try {
                const balance = await getNativeBalance(network, nodeAddress)

                let content = `Your node address has ${formatBalance(balance)}`

                if (balance.lt(MinBalance)) {
                    content = `${content}. You'll need to fund it with a small amount of MATIC tokens.`
                }

                resume()

                notify(
                    balance.lt(MinBalance) ? chalk.yellowBright('!') : ` `,
                    content
                )
            } catch (e) {
                resume()

                notify(
                    chalk.redBright('✗'),
                    "Fetching your node's balance failed"
                )
            }
        }

        notify(
            ` `,
            `Your node's generated name is ${chalk.greenBright(
                getNodeMnemonic(privateKey)
            )}`
        )

        if (operator) {
            notify()

            const resume = progress(
                (f) =>
                    `${chalk.bgGrey(' ')}   ${chalk.gray(
                        `Checking if your node has been paired with your Operator… ${f}`
                    )}`
            )

            try {
                const nodes = await getOperatorNodeAddresses(network, operator)

                const hub =
                    network === 'polygon'
                        ? 'https://streamr.network/hub'
                        : 'https://mumbai.streamr.network/hub'

                resume()

                if (!nodes.includes(nodeAddress.toLowerCase())) {
                    notify(
                        chalk.yellowBright('!'),
                        `You will need to pair your node with your Operator:`
                    )
                } else {
                    notify(` `, `Your node has been paired with your Operator:`)
                }

                notify(
                    ` `,
                    chalk.whiteBright(`${hub}/network/operators/${operator}`)
                )
            } catch (e) {
                resume()

                notify(chalk.redBright('✗'), 'Failed to fetch operator nodes')
            }
        }

        notify()

        notify(` `, `You can start your Streamr node now with`)

        notify(` `, chalk.whiteBright(`streamr-broker ${storagePath}`))

        notify()

        notify(` `, `For environment specific run instructions, see`)

        notify(
            ` `,
            chalk.whiteBright(
                `https://docs.streamr.network/guides/how-to-run-streamr-node`
            )
        )

        notify()

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
async function getOperatorAddress() {
    const setupOperator = await confirm({
        message:
            'Do you wish to participate in earning rewards by staking on stream Sponsorships?',
        default: true,
    })

    if (!setupOperator) {
        return undefined
    }

    const operator = await input({
        message: 'Enter your Operator address:',
        validate(value) {
            return isAddress(value) ? true : 'Invalid ethereum address'
        },
    })

    return operator.toLowerCase()
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

async function getNativeBalance(
    network: 'polygon' | 'mumbai',
    address: string
): Promise<BigNumber> {
    const url = config[network].rpcEndpoints[0]?.url || ''

    if (!/^https?:/i.test(url)) {
        throw new Error('Invalid RPC')
    }

    return new providers.JsonRpcProvider(url).getBalance(address)
}

function formatBalance(value: BigNumber): string {
    return chalk.whiteBright(
        `${utils
            .formatEther(value)
            .replace(/\.(\d+)/, (f) => f.substring(0, 3))} MATIC`
    )
}

async function getOperatorNodeAddresses(
    network: 'polygon' | 'mumbai',
    operatorAddress: string
): Promise<string[]> {
    const url = config[network].theGraphUrl

    const resp = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            query: `query {operator(id: "${operatorAddress}") {nodes}}`,
        }),
    })

    const { data } = z
        .object({
            data: z.object({
                operator: z.object({ nodes: z.array(z.string()) }),
            }),
        })
        .parse(await resp.json())

    return data.operator.nodes
}

function progress(fn: (frame: string) => string): () => void {
    const frames = '◢◣◤◥'

    let frameNo = 0

    let intervalId: NodeJS.Timeout | undefined

    function tick() {
        process.stdout.clearLine(0)

        process.stdout.cursorTo(0)

        process.stdout.write(fn(frames[frameNo]))

        frameNo = (frameNo + 1) % frames.length

        setTimeout
    }

    tick()

    intervalId = setInterval(tick, 400)

    return () => {
        clearInterval(intervalId)

        process.stdout.clearLine(0)

        process.stdout.cursorTo(0)
    }
}
