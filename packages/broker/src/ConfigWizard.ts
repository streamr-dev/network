import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs'
import * as os from 'os'
import chalk from "chalk"
import { v4 as uuid } from 'uuid'
import { Protocol } from 'streamr-network'

import * as WebsocketConfigSchema from './plugins/websocket/config.schema.json'
import * as MqttConfigSchema from './plugins/mqtt/config.schema.json'
import * as BrokerConfigSchema from './helpers/config.schema.json'
import * as LegacyWebsocketConfigSchema from './plugins/legacyWebsocket/config.schema.json'

const DEFAULT_WS_PORT = WebsocketConfigSchema.properties.port.default
const DEFAULT_MQTT_PORT = MqttConfigSchema.properties.port.default
const DEFAULT_HTTP_PORT = BrokerConfigSchema.properties.httpServer.properties.port.default
const DEFAULT_LEGACY_WS_PORT = LegacyWebsocketConfigSchema.properties.port.default

export const DEFAULT_CONFIG_PORTS = {
    WS: DEFAULT_WS_PORT,
    MQTT: DEFAULT_MQTT_PORT,
    HTTP: DEFAULT_HTTP_PORT,
    LEGACY_WS: DEFAULT_LEGACY_WS_PORT
}



const PRIVATE_KEY_SOURCE_GENERATE = 'Generate'
const PRIVATE_KEY_SOURCE_IMPORT = 'Import'

const logger = {
    info: (...args: any[]) => {
        // eslint-disable-next-line no-console
        console.log(chalk.bgWhite.black(':'), ...args)
    },
    warn: (...args: any[]) => {
        // eslint-disable-next-line no-console
        console.warn(chalk.bgYellow.black('!'), ...args)
    },
    error: (...args: any[]) => {
        // eslint-disable-next-line no-console
        console.error(chalk.bgRed.black('!'), ...args)
    }
}

const generateApiKey = (): string => {
    const hex = uuid().split('-').join('')
    return Buffer.from(hex).toString('base64').replace(/[^0-9a-z]/gi, '')
}

export const CONFIG_TEMPLATE: any = {
    network: {
        name: 'miner-node',
        trackers: [{
            ws: "wss://testnet1.streamr.network:30300",
            http: "https://testnet1.streamr.network:30300",
            id: "0x49D45c17bCA1Caf692001D21c38aDECCB4c08504"
        }],
        location: null,
        stun: "stun:stun.streamr.network:5349",
        turn: null
    },
    generateSessionId: false,
    streamrUrl: 'https://streamr.network',
    streamrAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
    storageNodeConfig: {
        registry: [{
            address: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
            url: "https://testnet2.streamr.network:8001"
        }]
    },
    plugins: {
        legacyWebsocket: {},
        testnetMiner: {
            rewardStreamId: "streamr.eth/brubeck-testnet/rewards",
            claimServerUrl: "http://testnet1.streamr.network:3011",
            stunServerHost: "stun.sipgate.net"
        },
        metrics: {
            consoleAndPM2IntervalInSeconds: 0,
            nodeMetrics: {
                storageNode: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
                client: {
                    wsUrl: `ws://127.0.0.1:${DEFAULT_LEGACY_WS_PORT}/api/v1/ws`,
                    httpUrl: "https://streamr.network/api/v1",
                }
            }
        },
    },
    apiAuthentication: {
        keys: [generateApiKey()]
    }
}

const privateKeyPrompts: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = [
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
        when: (answers: inquirer.Answers) => {
            return answers.generateOrImportPrivateKey === PRIVATE_KEY_SOURCE_IMPORT
        },
        validate: (input: string): string | boolean => {
            try {
                new Wallet(input)
                return true
            } catch (e) {
                if (e.message.includes('invalid hexlify value')){
                    return `Invalid privateKey provided for import: ${input}`
                } else {
                    return e.message
                }
            }
        }
    },
    {
        type: 'confirm',
        name: 'revealGeneratedPrivateKey',
        message: 'We strongly recommend backing up your private key. It will be written into the config file, but would you also like to see this sensitive information on screen now?',
        default: false,
        when: (answers: inquirer.Answers) => {
            return answers.generateOrImportPrivateKey === PRIVATE_KEY_SOURCE_GENERATE
        }
    }
]

export const getPrivateKey = (answers: inquirer.Answers): string => {
    return (answers.generateOrImportPrivateKey === PRIVATE_KEY_SOURCE_IMPORT && answers.importPrivateKey) ? answers.importPrivateKey : Wallet.createRandom().privateKey
}

const PLUGIN_DEFAULT_PORTS: {[pluginName: string]: number} = {
    websocket: DEFAULT_WS_PORT,
    mqtt: DEFAULT_MQTT_PORT,
    publishHttp: DEFAULT_HTTP_PORT
}

const PLUGIN_NAMES: {[pluginName: string]: string} = {
    WEBSOCKET: 'websocket',
    MQTT: 'mqtt',
    PUBLISH_HTTP: 'publishHttp'
}

const createPluginPrompts = (): Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> => {
    const selectPrompt: inquirer.CheckboxQuestion = {
        type: 'checkbox',
        name:'selectPlugins',
        message: 'Select the plugins to enable',
        choices: Object.values(PLUGIN_NAMES)
    }

    const MIN_PORT_VALUE = 1024
    const MAX_PORT_VALUE = 49151

    const portPrompts: Array<inquirer.Question> = Object.keys(PLUGIN_DEFAULT_PORTS).map((name) => {
        const defaultPort = PLUGIN_DEFAULT_PORTS[name]
        return {
            type: 'input',
            name: `${name}Port`,
            message: `Provide a port for the ${name} Plugin [Enter for default: ${defaultPort}]`,
            when: (answers: inquirer.Answers) => {
                return answers.selectPlugins.includes(name)
            },
            validate: (input: string | number): string | boolean => {
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

export const getConfig = (privateKey: string, pluginsAnswers: inquirer.Answers): any => {
    const config = { ... CONFIG_TEMPLATE, plugins: { ... CONFIG_TEMPLATE.plugins } }
    config.ethereumPrivateKey = privateKey

    const pluginNames = Object.values(PLUGIN_NAMES)
    pluginNames.forEach((pluginName) => {
        const defaultPluginPort = PLUGIN_DEFAULT_PORTS[pluginName]
        if (pluginsAnswers.selectPlugins && pluginsAnswers.selectPlugins.includes(pluginName)){
            let pluginConfig = {}
            const portNumber = parseInt(pluginsAnswers[`${pluginName}Port`])
            if (portNumber !== defaultPluginPort){
                const portObject = { port: portNumber }
                if (pluginName === PLUGIN_NAMES.PUBLISH_HTTP) {
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

export const selectStoragePathPrompt = {
    type: 'input',
    name: 'selectStoragePath',
    message: `Select a path to store the generated config in `,
    default: path.join(os.homedir(), '.streamr/broker-config.json'),
    validate: (input: string, answers: inquirer.Answers = {}): string | boolean => {
        try {
            const parentDirPath = path.dirname(input)

            answers.parentDirPath = parentDirPath
            answers.parentDirExists = existsSync(parentDirPath)
            answers.fileExists = existsSync(input)

            return true
        } catch (e) {
            return e.message
        }
    }
}

const selectStoragePath = async (): Promise<inquirer.Answers> => {
    const answers = await inquirer.prompt([selectStoragePathPrompt])

    if (answers.fileExists) {
        const overwriteAnswers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmOverwrite',
                message: `The selected destination ${answers.selectStoragePath} already exists, do you want to overwrite it?`,
                default: false,
            }
        ])

        if (!overwriteAnswers.confirmOverwrite) {
            return selectStoragePath()
        }
    }

    return answers
}

export const createStorageFile = async (config: any, answers: inquirer.Answers): Promise<string> => {
    if (!answers.parentDirExists) {
        mkdirSync(answers.parentDirPath)
    }
   
    writeFileSync(answers.selectStoragePath, JSON.stringify(config, null, 2))
    chmodSync(answers.selectStoragePath, '0600')
    return answers.selectStoragePath
}

export const getNodeIdentity = (privateKey: string) => {
    const nodeAddress = new Wallet(privateKey).address
    const mnemonic = Protocol.generateMnemonicFromAddress(nodeAddress)
    const networkExplorerUrl = `https://streamr.network/network-explorer/nodes/${nodeAddress}`
    return {
        mnemonic,
        networkExplorerUrl
    }
}

export const start = async(): Promise<void> => {
    try {
        const privateKeyAnswers = await inquirer.prompt(privateKeyPrompts)
        const privateKey = getPrivateKey(privateKeyAnswers)
        if (privateKeyAnswers.revealGeneratedPrivateKey) {
            logger.info(`This is your node\'s private key: ${privateKey}`)
        }
        const pluginsAnswers = await inquirer.prompt(createPluginPrompts())
        const config = getConfig(privateKey, pluginsAnswers)
        const storageAnswers = await selectStoragePath()
        const storagePath = await createStorageFile(config, storageAnswers)
        logger.info('Welcome to the Streamr Network')
        const {mnemonic, networkExplorerUrl} = getNodeIdentity(config)
        logger.info(`Your node's generated name is ${mnemonic}.`)
        logger.info('View your node in the Network Explorer:')
        logger.info(networkExplorerUrl)
        logger.info('You can start the broker now with')
        logger.info(`streamr-broker ${storagePath}`)
    } catch (e) {
        logger.warn('Broker Config Wizard encountered an error:')
        logger.error(e.message)
    }
}

export const PROMPTS = {
    privateKey: privateKeyPrompts,
    plugins: createPluginPrompts(),
}