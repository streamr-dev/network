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
    DEFAULT_WS_PORT,
    DEFAULT_MQTT_PORT,
    DEFAULT_HTTP_PORT,
    DEFAULT_LEGACY_WS_PORT
}

const MIN_PORT_VALUE = 1024
const MAX_PORT_VALUE = 49151

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
        name:'generateOrImportEthereumPrivateKey',
        message: 'Do you want to generate a new Ethereum private key or import an existing one?',
        choices: [PRIVATE_KEY_SOURCE_GENERATE, PRIVATE_KEY_SOURCE_IMPORT]
    },
    {
        type: 'password',
        name:'importPrivateKey',
        message: 'Please provide the private key to import',
        when: (answers: inquirer.Answers) => {
            return answers.generateOrImportEthereumPrivateKey === PRIVATE_KEY_SOURCE_IMPORT
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
            return answers.generateOrImportEthereumPrivateKey === PRIVATE_KEY_SOURCE_GENERATE
        }
    }
]

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

const pluginSelectorPrompt = {
    type: 'checkbox',
    name:'selectPlugins',
    message: 'Select the plugins to enable',
    choices: Object.values(PLUGIN_NAMES)
}

const pluginPrompts: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = []
Object.keys(PLUGIN_DEFAULT_PORTS).map((pluginName) => {
    const defaultPluginPort = PLUGIN_DEFAULT_PORTS[pluginName]
    pluginPrompts.push({
        type: 'input',
        name: `${pluginName}Port`,
        message: `Select a port for the ${pluginName} Plugin [Enter for default: ${defaultPluginPort}]`,
        when: (answers: inquirer.Answers) => {
            return answers.selectPlugins.includes(pluginName)
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
        default: defaultPluginPort
    })
})

// prompts = prompts.concat(pluginSelectorPrompt).concat(pluginPrompts).concat(revealGeneratedPrivateKeyPrompt)
export const getEthereumConfigFromAnswers = (answers: inquirer.Answers, config: any) => {
    config.ethereumPrivateKey = (answers.importPrivateKey) ? answers.importPrivateKey : Wallet.createRandom().privateKey
    if (answers.revealGeneratedPrivateKey) {
        logger.info(`This is your node\'s private key: ${config.ethereumPrivateKey}`)
    }
    return config
}

export const getPluginsConfigFromAnswers = (answers: inquirer.Answers, config: any): any => {
    const pluginNames = Object.values(PLUGIN_NAMES)
    pluginNames.forEach((pluginName) => {
        const defaultPluginPort = PLUGIN_DEFAULT_PORTS[pluginName]
        if (answers.selectPlugins && answers.selectPlugins.includes(pluginName)){
            let pluginConfig = {}
            const portNumber = parseInt(answers[`${pluginName}Port`])
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

export const selectDestinationPathPrompt = {
    type: 'input',
    name: 'selectDestinationPath',
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

const selectValidDestinationPath = async (): Promise<inquirer.Answers> => {
    const answers = await inquirer.prompt([selectDestinationPathPrompt])

    if (answers.fileExists) {
        const overwriteAnswers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmOverwrite',
                message: `The selected destination ${answers.selectDestinationPath} already exists, do you want to overwrite it?`,
                default: false,
            }
        ])

        if (!overwriteAnswers.confirmOverwrite) {
            return selectValidDestinationPath()
        }
    }

    return answers
}

export const createStorageFile = async (config: any, answers: inquirer.Answers): Promise<string> => {
    if (!answers.parentDirExists) {
        mkdirSync(answers.parentDirPath)
    }
   
    writeFileSync(answers.selectDestinationPath, JSON.stringify(config, null, 2))
    chmodSync(answers.selectDestinationPath, '0600')
    return answers.selectDestinationPath
}

export const startBrokerConfigWizard = async(): Promise<void> => {
    try {
        let config = { ... CONFIG_TEMPLATE, plugins: { ... CONFIG_TEMPLATE.plugins } }
        const ethereumAnswers = await inquirer.prompt(privateKeyPrompts)
        config = getEthereumConfigFromAnswers(ethereumAnswers, config)
        const pluginAnswers = await inquirer.prompt([pluginSelectorPrompt, ...pluginPrompts])
        config = getPluginsConfigFromAnswers(pluginAnswers, config)
        const nodeAddress = new Wallet(config.ethereumPrivateKey).address
        const mnemonic = Protocol.generateMnemonicFromAddress(nodeAddress)
        logger.info('Welcome to the Streamr Network')
        logger.info(`Your node's generated name is ${mnemonic}.`)
        logger.info('View your node in the Network Explorer:')
        logger.info(`https://streamr.network/network-explorer/nodes/${nodeAddress}`)
        const storageAnswers = await selectValidDestinationPath()
        const destinationPath = await createStorageFile(config, storageAnswers)
        logger.info('Broker Config Wizard ran succesfully')
        logger.info(`Stored config under ${destinationPath}`)
        logger.info('You can start the broker now with')
        logger.info(`streamr-broker ${destinationPath}`)
    } catch (e) {
        logger.warn('Broker Config Wizard encountered an error:')
        logger.error(e.message)
    }
}

export const CONFIG_WIZARD_PROMPTS = {
    ethereum: privateKeyPrompts,
    plugins: pluginPrompts,
}