import { checkbox, confirm, input, password, select } from '@inquirer/prompts'
import { config as streamrConfig } from '@streamr/config'
import { toEthereumAddress } from '@streamr/utils'
import chalk from 'chalk'
import { Wallet, isAddress, formatEther, parseEther, JsonRpcProvider } from 'ethers'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import capitalize from 'lodash/capitalize'
import omit from 'lodash/omit'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { CURRENT_CONFIGURATION_VERSION, formSchemaUrl } from '../config/migration'
import { generateMnemonicFromAddress } from '../helpers/generateMnemonicFromAddress'
import * as MqttConfigSchema from '../plugins/mqtt/config.schema.json'
import * as WebsocketConfigSchema from '../plugins/websocket/config.schema.json'
import { ConfigFile, getDefaultFile } from './config'
import * as BrokerConfigSchema from './config.schema.json'

const MIN_BALANCE = parseEther('0.1')

type EnvironmentId = 'polygon' | 'polygonAmoy'

export async function start(): Promise<void> {
    log(`
        >
        > ***Welcome to the Streamr Network!***
        > This Config Wizard will help you setup your node.
        >
        > The steps are documented here:
        > *https://docs.streamr.network/guides/how-to-run-streamr-node#config-wizard*
        >
    `)

    try {
        const privateKey = await getPrivateKey()

        const nodeAddress = new Wallet(privateKey).address

        const environmentId = await getEnvironmentId()

        const operator = await getOperatorAddress()

        const operatorPlugins = operator
            ? {
                  operator: {
                      operatorContractAddress: operator
                  }
              }
            : {}

        const { http, ...pubsubPlugins } = await getPubsubPlugins()

        /**
         * Port number for the `http` plugin has to be defined within
         * the `httpServer` object in the config's root. See below.
         */
        if (http) {
            Object.assign(pubsubPlugins, {
                http: omit(http, 'port')
            })
        }

        const httpServer = http?.port ? { port: http.port } : undefined

        const storagePath = await getStoragePath()

        const apiKey = Buffer.from(uuid().replace(/-/g, ''))
            .toString('base64')
            .replace(/[^\da-z]/gi, '')

        const config: ConfigFile = {
            $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION),
            client: {
                auth: {
                    privateKey
                },
                environment: environmentId
            },
            plugins: {
                ...operatorPlugins,
                ...pubsubPlugins
            },
            httpServer,
            apiAuthentication: {
                keys: [apiKey]
            }
        }

        persistConfig(storagePath, config)

        log(`
            >
            > ~ *Congratulations, you've setup your Streamr node!*
            > Your node address is ${chalk.greenBright(nodeAddress)}
            > Your node's generated name is ${chalk.greenBright(getNodeMnemonic(privateKey))}
        `)

        if (operator) {
            const resume = animateLine((spinner) =>
                style(`> Your node address has *${spinner} MATIC* _– checking balance…_`)
            )

            try {
                const balance = await getNativeBalance(environmentId, nodeAddress)

                const content = `Your node address has *${Number(formatEther(balance)).toFixed(2)} MATIC*`

                resume()

                if (balance < MIN_BALANCE) {
                    log(`
                        > ! ${content}. You'll need to fund it with a small amount of MATIC tokens.
                    `)
                } else {
                    log(`> ${content}`)
                }
            } catch {
                resume()

                log("> x Failed to fetch node's balance")
            }
        }

        if (operator) {
            log('> ')

            const resume = animateLine((spinner) =>
                style(`
                    > _Checking if your node has been paired with your Operator… ${spinner}_
                `)
            )

            try {
                const nodes = await getOperatorNodeAddresses(environmentId, operator)

                resume()

                if (nodes !== undefined) {
                    if (!nodes.includes(nodeAddress.toLowerCase())) {
                        log('> ! You will need to pair your node with your Operator:')
                    } else {
                        log('> Your node has been paired with your Operator:')
                    }
                } else {
                    log(`
                        > x Your Operator could not be found on the **${capitalize(environmentId)}** network, see
                    `)
                }

                log(`> *https://streamr.network/hub/network/operators/${operator}*`)
            } catch {
                resume()

                log('> x Failed to fetch operator nodes')
            }
        }

        log(`
            >
            > You can start your Streamr node now with
            > *streamr-node ${storagePath}*
            >
            > For environment specific run instructions, see
            > *https://docs.streamr.network/guides/how-to-run-streamr-node*
            >
        `)
    } catch (e: any) {
        if (typeof e.message === 'string' && /force closed/i.test(e.message)) {
            /**
             * Hitting ctrl+c key combination causes the `inquirer` library to throw
             * the "User force closed the prompt" exception. Let's ignore it.
             */
            return
        }

        throw e
    }
}

/**
 * Generates a mnemonic for a given private key.
 */
export function getNodeMnemonic(privateKey: string): string {
    return generateMnemonicFromAddress(toEthereumAddress(new Wallet(privateKey).address))
}

/**
 * Lets the user generate a private key or import an existing private key.
 */
async function getPrivateKey(): Promise<string> {
    const privateKeySource = await select<'Generate' | 'Import'>({
        message: 'Do you want to generate a new Ethereum private key or import an existing one?',
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
                    new Wallet(value)

                    return true
                } catch (_) {
                    return 'Invalid private key provided.'
                }
            }
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
            }
        })
    }

    return privateKey
}

/**
 * Lets the user decide the desired network for their node.
 */
async function getEnvironmentId(): Promise<EnvironmentId> {
    return select<EnvironmentId>({
        message: 'Which network do you want to configure your node to connect to?',
        choices: [
            { value: 'polygon', name: 'Streamr 1.0 mainnet + Polygon' },
            {
                value: 'polygonAmoy',
                name: 'Streamr 1.0 testnet + Polygon Amoy testnet'
            }
        ],
        default: 'polygon'
    })
}

/**
 * Lets the user gather and configure desired operator plugins.
 * @returns A valid Ethereum address if the user decide to participate
 * in earning rewards, and `undefined` otherwise.
 */
async function getOperatorAddress(): Promise<string | undefined> {
    const setupOperator = await confirm({
        message: 'Do you wish to participate in earning rewards by staking on stream Sponsorships?',
        default: true
    })

    if (!setupOperator) {
        return undefined
    }

    const operator = await input({
        message: 'Enter your Operator address:',
        validate(value) {
            return isAddress(value) ? true : 'Invalid ethereum address'
        }
    })

    return operator.toLowerCase()
}

interface PubsubPlugin {
    port?: number
}

type PubsubPluginKey = 'websocket' | 'mqtt' | 'http'

const DEFAULT_PORTS: Record<PubsubPluginKey, number> = {
    websocket: WebsocketConfigSchema.properties.port.default,
    mqtt: MqttConfigSchema.properties.port.default,
    http: BrokerConfigSchema.properties.httpServer.properties.port.default
}

/**
 * Lets the user select and configure desired pub/sub plugins.
 */
async function getPubsubPlugins(): Promise<Partial<Record<PubsubPluginKey, PubsubPlugin>>> {
    const setupPubsub = await confirm({
        message: 'Do you wish to use your node for data publishing/subscribing?',
        default: true
    })

    if (!setupPubsub) {
        return {}
    }

    const keys = await checkbox<PubsubPluginKey>({
        message: 'Select the plugins to enable',
        choices: [
            { value: 'websocket', name: 'WebSocket' },
            { value: 'mqtt', name: 'MQTT' },
            { value: 'http', name: 'HTTP' }
        ]
    })

    const pubsubPlugins: Awaited<ReturnType<typeof getPubsubPlugins>> = {}

    for (const key of keys) {
        const defaultPort = DEFAULT_PORTS[key]

        const port = Number(
            await input({
                message: `Provide a port for the ${key} plugin`,
                default: defaultPort.toString(),
                validate(value) {
                    try {
                        z.coerce
                            .number({
                                invalid_type_error: 'Non-numeric value provided'
                            })
                            .int('Non-integer value provided')
                            .min(1024)
                            .max(49151)
                            .superRefine((value, ctx) => {
                                const [pluginKey] =
                                    Object.entries(pubsubPlugins).find(
                                        ([pluginKey, plugin]) =>
                                            value === (plugin.port ?? DEFAULT_PORTS[pluginKey as PubsubPluginKey])
                                    ) ?? []

                                if (pluginKey) {
                                    ctx.addIssue({
                                        code: z.ZodIssueCode.custom,
                                        message: `Port ${value} is taken by ${pluginKey}`
                                    })
                                }
                            })
                            .parse(value)

                        return true
                    } catch (e: unknown) {
                        return (e as z.ZodError).issues.map(({ message }) => message).join(', ')
                    }
                }
            })
        )

        pubsubPlugins[key] = port !== defaultPort ? { port } : {}
    }

    return pubsubPlugins
}

/**
 * Lets the user decide where to write the config file.
 */
async function getStoragePath(): Promise<string> {
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
}

/**
 * Writes the config into a file.
 */
function persistConfig(storagePath: string, config: ConfigFile): void {
    const dirPath = path.dirname(storagePath)

    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, {
            recursive: true
        })
    }

    writeFileSync(storagePath, JSON.stringify(config, null, 4))

    chmodSync(storagePath, '600')
}

/**
 * Gets a wallet balance of the network-native token for the given
 * wallet address.
 */
async function getNativeBalance(environmentId: EnvironmentId, address: string): Promise<bigint> {
    const url = streamrConfig[environmentId].rpcEndpoints[0]?.url

    if (!url || !/^https?:/i.test(url)) {
        throw new Error('Invalid RPC')
    }

    return new JsonRpcProvider(url).getBalance(address)
}

/**
 * Gets an array of node addresses associated with the given operator
 * contract address on the given network.
 */
async function getOperatorNodeAddresses(
    environmentId: EnvironmentId,
    operatorAddress: string
): Promise<string[] | undefined> {
    const url = streamrConfig[environmentId].theGraphUrl

    const resp = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            query: `query { operator(id: "${operatorAddress}") { nodes } }`
        })
    })

    const { data } = z
        .object({
            data: z.object({
                operator: z.union([z.null(), z.object({ nodes: z.array(z.string()) })])
            })
        })
        .parse(await resp.json())

    return data.operator ? data.operator.nodes : undefined
}

/**
 * Prints out an animated busyness indicator and does not move on
 * to the next line until torn down.
 * @returns A teardown callback that cleans up the line and brings
 * the cursor to BOL.
 */
function animateLine(fn: (spinner: string) => string): () => void {
    const frames = '◢◣◤◥'

    let frameNo = 0

    function tick() {
        /**
         * `isTTY` is false in CI which also means `clearLine` and
         * `cursorTo` are not functions.
         */
        if (process.stdout.isTTY) {
            process.stdout.clearLine(0)

            process.stdout.cursorTo(0)
        }

        process.stdout.write(fn(frames[frameNo]))

        frameNo = (frameNo + 1) % frames.length
    }

    tick()

    const intervalId = setInterval(tick, 400)

    return () => {
        clearInterval(intervalId)

        /**
         * `isTTY` is false in CI which also means `clearLine` and
         * `cursorTo` are not functions.
         */
        if (process.stdout.isTTY) {
            process.stdout.clearLine(0)

            process.stdout.cursorTo(0)
        }
    }
}

/**
 * Formats the given message with colors and styles with the use
 * of a markdown-ish syntax, like:
 * - \*\*bold\*\*,
 * - \_dim\_,
 * - \*bright white\*,
 * - \> indent normally,
 * - \> ! indent as a warning,
 * - \> x indent as an error, and
 * - \> ~ indent as a confirmation or success.
 */
function style(message: string): string {
    let result = message

    const filters: [RegExp, chalk.Chalk][] = [
        [/\*\*([^*]+)\*\*/g, chalk.bold],
        [/\*([^*]+)\*/g, chalk.whiteBright],
        [/_([^_]+)_/g, chalk.gray]
    ]

    for (const [regexp, colorer] of filters) {
        result = result.replace(regexp, (_, m) => colorer(m))
    }

    return result
        .replace(/^[^\S\r\n]*(>?)[^\S\r\n]*([!x~]?)[^\S\r\n]*/gim, (_, indent, decorator) =>
            [
                indent && chalk.bgGray(' '),
                decorator === '!' && chalk.yellowBright.bold(' ! '),
                decorator === 'x' && chalk.redBright.bold(' ✗ '),
                decorator === '~' && chalk.greenBright.bold(' ✓ '),
                decorator === '' && '   '
            ]
                .filter(Boolean)
                .join('')
        )
        .trim()
}

function log(message = ''): void {
    console.info(style(message))
}
