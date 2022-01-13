import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs'
import chalk from 'chalk'
import { v4 as uuid } from 'uuid'
import * as Protocol from 'streamr-client-protocol'

import * as WebsocketConfigSchema from './plugins/websocket/config.schema.json'
import * as MqttConfigSchema from './plugins/mqtt/config.schema.json'
import * as BrokerConfigSchema from './helpers/config.schema.json'
import * as LegacyWebsocketConfigSchema from './plugins/legacyWebsocket/config.schema.json'
import { getDefaultFile } from './config'

const createLogger = () => {
    return {
        info: (...args: any[]) => {
            console.info(chalk.bgWhite.black(':'), ...args)
        },
        error: (...args: any[]) => {
            console.error(chalk.bgRed.black('!'), ...args)
        }
    }
}

const generateApiKey = (): string => {
    const hex = uuid().split('-').join('')
    return Buffer.from(hex).toString('base64').replace(/[^0-9a-z]/gi, '')
}

export const DEFAULT_CONFIG_PORTS: { [plugin: string]: number } = {
    WS: WebsocketConfigSchema.properties.port.default,
    MQTT: MqttConfigSchema.properties.port.default,
    HTTP: BrokerConfigSchema.properties.httpServer.properties.port.default,
    LEGACY_WS: LegacyWebsocketConfigSchema.properties.port.default,
}

const PLUGIN_NAMES: {[pluginName: string]: string} = {
    WS: 'websocket',
    MQTT: 'mqtt',
    HTTP: 'publishHttp'
}

const PRIVATE_KEY_SOURCE_GENERATE = 'Generate'
const PRIVATE_KEY_SOURCE_IMPORT = 'Import'

export const CONFIG_TEMPLATE: any = {
    client: {
        auth: {
        },
        restUrl: 'https://streamr.network/api/v1',
        network: {
            name: 'miner-node',
            trackers: [
                {
                    "id": "0xFBB6066c44bc8132bA794C73f58F391273E3bdA1",
                    "ws": "wss://testnet3.streamr.network:30401",
                    "http": "https://testnet3.streamr.network:30401"
                },
                {
                    "id": "0x3D61bFeFA09CEAC1AFceAA50c7d79BE409E1ec24",
                    "ws": "wss://testnet3.streamr.network:30402",
                    "http": "https://testnet3.streamr.network:30402"
                },
                {
                    "id": "0xE80FB5322231cBC1e761A0F896Da8E0CA2952A66",
                    "ws": "wss://testnet3.streamr.network:30403",
                    "http": "https://testnet3.streamr.network:30403"
                },
                {
                    "id": "0xf626285C6AACDE39ae969B9Be90b1D9855F186e0",
                    "ws": "wss://testnet3.streamr.network:30404",
                    "http": "https://testnet3.streamr.network:30404"
                },
                {
                    "id": "0xce88Da7FE0165C8b8586aA0c7C4B26d880068219",
                    "ws": "wss://testnet3.streamr.network:30405",
                    "http": "https://testnet3.streamr.network:30405"
                },
                {
                    "id": "0x05e7a0A64f88F84fB1945a225eE48fFC2c48C38E",
                    "ws": "wss://testnet4.streamr.network:30401",
                    "http": "https://testnet4.streamr.network:30401"
                },
                {
                    "id": "0xF15784106ACd35b0542309CDF2b35cb5BA642C4F",
                    "ws": "wss://testnet4.streamr.network:30402",
                    "http": "https://testnet4.streamr.network:30402"
                },
                {
                    "id": "0x77FA7Af34108abdf8e92B8f4C4AeC7CbfD1d6B09",
                    "ws": "wss://testnet4.streamr.network:30403",
                    "http": "https://testnet4.streamr.network:30403"
                },
                {
                    "id": "0x7E83e0bdAF1eF06F31A02f35A07aFB48179E536B",
                    "ws": "wss://testnet4.streamr.network:30404",
                    "http": "https://testnet4.streamr.network:30404"
                },
                {
                    "id": "0x2EeF37180691c75858Bf1e781D13ae96943Dd388",
                    "ws": "wss://testnet4.streamr.network:30405",
                    "http": "https://testnet4.streamr.network:30405"
                }
            ],
            stunUrls: [
                "stun:stun.streamr.network:5349"
            ]
        },
        storageNodeRegistry: [{
            address: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
            url: "https://testnet2.streamr.network:8001"
        }]
    },
    plugins: {
        legacyWebsocket: {},
        testnetMiner: {
            rewardStreamIds: [
                'streamr.eth/brubeck-testnet/rewards/5hhb49',
                'streamr.eth/brubeck-testnet/rewards/95hc37',
                'streamr.eth/brubeck-testnet/rewards/12ab22',
                'streamr.eth/brubeck-testnet/rewards/z15g13',
                'streamr.eth/brubeck-testnet/rewards/111249',
                'streamr.eth/brubeck-testnet/rewards/0g2jha',
                'streamr.eth/brubeck-testnet/rewards/fijka2',
                'streamr.eth/brubeck-testnet/rewards/91ab49',
                'streamr.eth/brubeck-testnet/rewards/giab22',
                'streamr.eth/brubeck-testnet/rewards/25kpf4'
            ],
            claimServerUrl: "http://testnet1.streamr.network:3011",
            stunServerHost: "stun.sipgate.net"
        },
        metrics: {
            consoleAndPM2IntervalInSeconds: 0,
            nodeMetrics: {
                storageNode: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
                client: {
                    wsUrl: `ws://127.0.0.1:${DEFAULT_CONFIG_PORTS.LEGACY_WS}/api/v1/ws`,
                    httpUrl: "https://streamr.network/api/v1",
                }
            }
        },
    },
    apiAuthentication: {
        keys: [generateApiKey()]
    }
}

const PRIVATE_KEY_PROMPTS: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = [
    {
        type: 'list',
        name:'generateOrImportPrivateKey',
        message: 'Do you want to generate a new Ethereum private key or import an existing one?',
        choices: [PRIVATE_KEY_SOURCE_GENERATE, PRIVATE_KEY_SOURCE_IMPORT]
    },
    {
        type: 'password',
        name:'importPrivateKey',
        message: 'Please provide the private key to import',
        when: (answers: inquirer.Answers): boolean => {
            return answers.generateOrImportPrivateKey === PRIVATE_KEY_SOURCE_IMPORT
        },
        validate: (input: string): string | boolean => {
            try {
                new Wallet(input)
                return true
            } catch (e: any) {
                return 'Invalid private key provided.'
            }
        }
    },
    {
        type: 'confirm',
        name: 'revealGeneratedPrivateKey',
        // eslint-disable-next-line max-len
        message: 'We strongly recommend backing up your private key. It will be written into the config file, but would you also like to see this sensitive information on screen now?',
        default: false,
        when: (answers: inquirer.Answers): boolean => {
            return answers.generateOrImportPrivateKey === PRIVATE_KEY_SOURCE_GENERATE
        }
    }
]

const createPluginPrompts = (): Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> => {
    const selectPrompt: inquirer.CheckboxQuestion = {
        type: 'checkbox',
        name:'selectPlugins',
        message: 'Select the plugins to enable',
        choices: Object.values(PLUGIN_NAMES)
    }

    const portPrompts: Array<inquirer.Question> = Object.keys(DEFAULT_CONFIG_PORTS).map((key) => {
        const name = PLUGIN_NAMES[key]
        const defaultPort = DEFAULT_CONFIG_PORTS[key]
        return {
            type: 'input',
            name: `${name}Port`,
            message: `Provide a port for the ${name} Plugin [Enter for default: ${defaultPort}]`,
            when: (answers: inquirer.Answers) => {
                return answers.selectPlugins.includes(name)
            },
            validate: (input: string | number): string | boolean => {
                const MIN_PORT_VALUE = 1024
                const MAX_PORT_VALUE = 49151
                const portNumber = (typeof input === 'string') ? Number(input) : input
                if (Number.isNaN(portNumber)) {
                    return `Non-numeric value provided`
                }

                if (!Number.isInteger(portNumber)) {
                    return `Non-integer value provided`
                }

                if (portNumber < MIN_PORT_VALUE || portNumber > MAX_PORT_VALUE) {
                    return `Out of range port ${portNumber} provided (valid range ${MIN_PORT_VALUE}-${MAX_PORT_VALUE})`
                }
                return true
            },
            default: defaultPort
        }
    })

    return [selectPrompt, ...portPrompts]
}

export const PROMPTS = {
    privateKey: PRIVATE_KEY_PROMPTS,
    plugins: createPluginPrompts(),
}

export const storagePathPrompts = [{
    type: 'input',
    name: 'storagePath',
    message: 'Select a path to store the generated config in',
    default: getDefaultFile()
},
{
    type: 'confirm',
    name: 'overwrite',
    message: (answers: inquirer.Answers): string => `The selected destination ${answers.storagePath} already exists, do you want to overwrite it?`,
    default: false,
    when: (answers: inquirer.Answers): boolean => existsSync(answers.storagePath)
}]

export const getConfig = (privateKey: string, pluginsAnswers: inquirer.Answers): any => {
    const config = { ... CONFIG_TEMPLATE, plugins: { ... CONFIG_TEMPLATE.plugins } }
    config.client.auth.privateKey = privateKey
    config.client.network.id = new Wallet(privateKey).address

    const pluginKeys = Object.keys(PLUGIN_NAMES)
    pluginKeys.forEach((pluginKey) => {
        const pluginName = PLUGIN_NAMES[pluginKey]
        const defaultPort = DEFAULT_CONFIG_PORTS[pluginKey]
        if (pluginsAnswers.selectPlugins && pluginsAnswers.selectPlugins.includes(pluginName)){
            let pluginConfig = {}
            const portNumber = parseInt(pluginsAnswers[`${pluginName}Port`])
            if (portNumber !== defaultPort){
                const portObject = { port: portNumber }
                if (pluginName === PLUGIN_NAMES.HTTP) {
                    // the publishHttp plugin is special, it needs to be added to the config after the other plugins
                    config.httpServer = portObject
                } else {
                    // user provided a custom value, fill in
                    pluginConfig = portObject
                }
            }
            config.plugins![pluginName] = pluginConfig
        }
    })

    return config
}

const selectStoragePath = async (): Promise<inquirer.Answers> => {
    let answers
    do {
        answers = await inquirer.prompt(storagePathPrompts)
    } while (answers.overwrite === false)
    return answers
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createStorageFile = async (config: any, answers: inquirer.Answers): Promise<string> => {
    const dirPath = path.dirname(answers.storagePath)
    const dirExists = existsSync(dirPath)
    if (!dirExists) {
        mkdirSync(dirPath, {
            recursive: true
        })
    }
    writeFileSync(answers.storagePath, JSON.stringify(config, null, 2))
    chmodSync(answers.storagePath, '0600')
    return answers.storagePath
}

export const getPrivateKey = (answers: inquirer.Answers): string => {
    return (answers.generateOrImportPrivateKey === PRIVATE_KEY_SOURCE_IMPORT) ? answers.importPrivateKey : Wallet.createRandom().privateKey
}

export const getNodeIdentity = (privateKey: string): {
    mnemonic: string
    networkExplorerUrl: string
} => {
    const nodeAddress = new Wallet(privateKey).address
    const mnemonic = Protocol.generateMnemonicFromAddress(nodeAddress)
    const networkExplorerUrl = `https://streamr.network/network-explorer/nodes/${nodeAddress}`
    return {
        mnemonic,
        networkExplorerUrl
    }
}

export const start = async (
    getPrivateKeyAnswers = () => inquirer.prompt(PRIVATE_KEY_PROMPTS),
    getPluginAnswers = () => inquirer.prompt(createPluginPrompts()),
    getStorageAnswers = selectStoragePath,
    logger = createLogger()
): Promise<void> => {
    try {
        const privateKeyAnswers = await getPrivateKeyAnswers()
        const privateKey = getPrivateKey(privateKeyAnswers)
        if (privateKeyAnswers.revealGeneratedPrivateKey) {
            logger.info(`This is your node\'s private key: ${privateKey}`)
        }
        const pluginsAnswers = await getPluginAnswers()
        const config = getConfig(privateKey, pluginsAnswers)
        const storageAnswers = await getStorageAnswers()
        const storagePath = await createStorageFile(config, storageAnswers)
        logger.info('Welcome to the Streamr Network')
        const {mnemonic, networkExplorerUrl} = getNodeIdentity(privateKey)
        logger.info(`Your node's generated name is ${mnemonic}.`)
        logger.info('View your node in the Network Explorer:')
        logger.info(networkExplorerUrl)
        logger.info('You can start the broker now with')
        logger.info(`streamr-broker ${storagePath}`)
    } catch (e: any) {
        logger.error("Broker Config Wizard encountered an error:\n" + e.message)
    }
}
