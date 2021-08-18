import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { Config } from './config'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import * as os from 'os'
import chalk from "chalk"

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

export const DEFAULT_CONFIG: any = {
    network: {
        name: 'miner-node',
        trackers: [{
            ws: "wss://testnet1.streamr.network:30300",
            http: "https://testnet1.streamr.network:30300",
            id: "0x49D45c17bCA1Caf692001D21c38aDECCB4c08504"
        }],
        location: null,
        stun: "stun:turn.streamr.network:5349",
        turn: null
    },
    streamrUrl: 'https://streamr.network',
    streamrAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
    storageNodeConfig: {
        registry: [{
            address: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
            url: "https://testnet2.streamr.network:8001"
        }]
    },
    plugins: {
        legacyWebsocket: {
            port: DEFAULT_LEGACY_WS_PORT
        },
        testnetMiner: {
            rewardStreamId: "streamr.eth/brubeck-testnet/rewards",
            claimServerUrl: "http://testnet2.streamr.network:3011",
            maxClaimDelay: 5000
        },
        metrics: {
            consoleAndPM2IntervalInSeconds: 0,
            clientWsUrl: `ws://127.0.0.1:${DEFAULT_LEGACY_WS_PORT}/api/v1/ws`,
            clientHttpUrl: "https://streamr.network/api/v1",
            perNodeMetrics: {
                enabled: true,
                storageNode: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
                intervals: {
                    "sec": 1000,
                    "min": 60000,
                    "hour": 3600000,
                    "day": 86400000
                }
            }
        },
    },
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

const PLUGIN_TEMPLATES: {[pluginName: string]: {port: number}} = {
    websocket: { port: DEFAULT_WS_PORT },
    mqtt: { port: DEFAULT_MQTT_PORT },
    publishHttp: { port: DEFAULT_HTTP_PORT }
}

const pluginSelectorPrompt = {
    type: 'checkbox',
    name:'selectPlugins',
    message: 'Select the plugins to enable',
    choices: Object.keys(PLUGIN_TEMPLATES)
}

const pluginPrompts: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = []
Object.keys(PLUGIN_TEMPLATES).map((pluginName) => {
    const plugin = PLUGIN_TEMPLATES[pluginName]
    pluginPrompts.push({
        type: 'input',
        name: `${pluginName}Port`,
        message: `Select a port for the ${pluginName} Plugin [Enter for default: ${plugin.port}]`,
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
        default: plugin.port
    })
})

prompts = prompts.concat(pluginSelectorPrompt).concat(pluginPrompts)

export const getConfigFromAnswers = (answers: any): Config => {
    const config = { ... DEFAULT_CONFIG, plugins: { ... DEFAULT_CONFIG.plugins } }

    const pluginNames = Object.keys(PLUGIN_TEMPLATES)
    pluginNames.forEach((pluginName) => {
        const template = PLUGIN_TEMPLATES[pluginName]
        if (answers.selectPlugins && answers.selectPlugins.includes(pluginName)){
            let pluginConfig = {}
            if (answers[`${pluginName}Port`] !== template.port){
                if (pluginName === 'publishHttp') {
                    // the publishHttp plugin is special, it needs to be added to the config after the other plugins
                    config.httpServer = {
                        port: answers[`${pluginName}Port`]
                    }
                } else {
                    // user provided a custom value, fill in
                    pluginConfig = { ...template, port: answers[`${pluginName}Port`] }
                }
            }
            config.plugins![pluginName] = pluginConfig
        }
    })

    config.ethereumPrivateKey = (answers.importPrivateKey) ? answers.importPrivateKey : Wallet.createRandom().privateKey

    return config as Config
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

            return (answers.parentDirExists || answers.fileExists)
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

export const createStorageFile = (config: Config, answers: inquirer.Answers): string => {
    if (!answers.parentDirExists) {
        mkdirSync(answers.parentDirPath)
    }
   
    writeFileSync(answers.selectDestinationPath, JSON.stringify(config, null, 2))
    return answers.selectDestinationPath
}

export async function startBrokerConfigWizard(): Promise<void> {
    try {
        const answers = await inquirer.prompt(prompts)
        const config = getConfigFromAnswers(answers)
        logger.info(`This will be your node's address: ${new Wallet(config.ethereumPrivateKey).address}`)
        logger.info('This is your node\'s private key. Please store it in a secure location:')
        logger.alert(config.ethereumPrivateKey)
        const storageAnswers = await selectValidDestinationPath()
        const destinationPath = createStorageFile(config, storageAnswers)
        logger.info('Broker Config Wizard ran succesfully')
        logger.print(`Stored config under ${destinationPath}`)
        logger.print(`You can start the broker now with`)
        logger.info(`streamr-broker ${destinationPath}`)
    } catch (e) {
        logger.warn('Broker Config Wizard encountered an error:')
        logger.error(e.message)
    }
}

export const CONFIG_WIZARD_PROMPTS = prompts