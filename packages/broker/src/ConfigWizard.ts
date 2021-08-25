import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
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
    print: (...args: any[]) => {
        console.log(chalk.bgWhite.black(':'), ...args)
    },
    info: (...args: any[]) => {
        console.log(chalk.bgWhite.black(':', ...args))
    },
    alert: (...args: any[]) => {
        console.log(chalk.bgYellow.black('!', ...args))
    },
    warn: (...args: any[]) => {
        console.log(chalk.bgYellow.black('!'), ...args)
    },
    error: (...args: any[]) => {
        console.log(chalk.bgRed.black('!'), ...args)
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

let prompts: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = [
    {
        type: 'list',
        name:'generateOrImportEthereumPrivateKey',
        message: 'Do you want to generate a new Ethereum private key or import an existing one?',
        choices: [PRIVATE_KEY_SOURCE_GENERATE, PRIVATE_KEY_SOURCE_IMPORT]
    },
    {
        type: 'input',
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
        validate: (input: string, answers: inquirer.Answers): string | boolean => {
            const portNumber = parseInt(input || answers[`${pluginName}Port`])
            if (!Number.isInteger(portNumber)) {
                return `Non-numeric value provided`
            }

            if (portNumber < MIN_PORT_VALUE || portNumber > MAX_PORT_VALUE) {
                return `Out of range port ${portNumber} provided (valid range ${MIN_PORT_VALUE}-${MAX_PORT_VALUE})`
            }

            return true
        },
        default: defaultPluginPort
    })
})

prompts = prompts.concat(pluginSelectorPrompt).concat(pluginPrompts)

export const getConfigFromAnswers = (answers: inquirer.Answers): any => {
    const config = { ... CONFIG_TEMPLATE, plugins: { ... CONFIG_TEMPLATE.plugins } }

    const pluginNames = Object.values(PLUGIN_NAMES)
    pluginNames.forEach((pluginName) => {
        const defaultPluginPort = PLUGIN_DEFAULT_PORTS[pluginName]
        if (answers.selectPlugins && answers.selectPlugins.includes(pluginName)){
            let pluginConfig = {}
            if (answers[`${pluginName}Port`] !== defaultPluginPort){
                if (pluginName === PLUGIN_NAMES.PUBLISH_HTTP) {
                    // the publishHttp plugin is special, it needs to be added to the config after the other plugins
                    config.httpServer = {
                        port: answers[`${pluginName}Port`]
                    }
                } else {
                    // user provided a custom value, fill in
                    pluginConfig = { port: answers[`${pluginName}Port`] }
                }
            }
            config.plugins![pluginName] = pluginConfig
        }
    })

    config.ethereumPrivateKey = (answers.importPrivateKey) ? answers.importPrivateKey : Wallet.createRandom().privateKey

    return config
}

export const selectDestinationPathPrompt = {
    type: 'input',
    name: 'selectDestinationPath',
    message: `Select a path to store the generated config in `,
    default: path.join(os.homedir(), '.streamr/broker-config.json'),
    validate: (input: string, answers: inquirer.Answers = {}): string | boolean => {
        try {
            const filePath = input || answers.selectDestinationPath
            const parentDirPath = path.dirname(filePath)

            answers.parentDirPath = parentDirPath
            answers.parentDirExists = existsSync(parentDirPath)
            answers.fileExists = existsSync(filePath)

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
    return answers.selectDestinationPath
}

export const startBrokerConfigWizard = async(): Promise<void> => {
    try {
        const answers = await inquirer.prompt(prompts)
        const config = getConfigFromAnswers(answers)
        const nodeAddress = new Wallet(config.ethereumPrivateKey).address
        const mnemonic = Protocol.generateMnemonicFromAddress(nodeAddress)
        logger.info('Welcome to the Streamr Network')
        logger.print(`Your node's generated name is ${mnemonic}.`)
        logger.print('View your node in the Network Explorer:')
        logger.print(`https://streamr.network/network-explorer/nodes/${nodeAddress}`)
        logger.info('This is your node\'s private key. Please store it in a secure location:')
        logger.alert(config.ethereumPrivateKey)
        const storageAnswers = await selectValidDestinationPath()
        const destinationPath = await createStorageFile(config, storageAnswers)
        logger.info('Broker Config Wizard ran succesfully')
        logger.print(`Stored config under ${destinationPath}`)
        logger.print('You can start the broker now with')
        logger.info(`streamr-broker ${destinationPath}`)
    } catch (e) {
        logger.warn('Broker Config Wizard encountered an error:')
        logger.error(e.message)
    }
}

export const CONFIG_WIZARD_PROMPTS = prompts