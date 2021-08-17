import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { Config } from './config'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import * as os from 'os'
import chalk from "chalk"

function logger(...args: any[]) {
    console.log(chalk.bgWhite.black(':'), ...args)
}

logger.info = (...args: any[]) => {
    console.log(chalk.bgWhite.black(':', ...args))
}

logger.alert = (...args: any[]) => {
    console.log(chalk.bgYellow.black('!', ...args))
}

logger.warn = (...args: any[]) => {
    console.log(chalk.bgYellow.black('!'), ...args)
}

logger.error = (...args: any[]) => {
    console.log(chalk.bgRed.black('!'), ...args)
}

const MIN_PORT_VALUE = 1024
const MAX_PORT_VALUE = 49151

const DEFAULT_WS_PORT = 7170
const DEFAULT_MQTT_PORT = 7171
const DEFAULT_HTTP_PORT = 7172
const DEFAULT_LEGACY_WS_PORT = 7173

export const DEFAULT_CONFIG: Config = {
    ethereumPrivateKey: '',
    generateSessionId: false,
    network: {
        name: 'miner-node',
        trackers: [
            "wss://testnet1.streamr.network:30300"
        ],
        location: null
    },
    reporting: {
        intervalInSeconds: 0,
        streamr: null,
        perNodeMetrics: {
            enabled: true,
            wsUrl: `ws://127.0.0.1:${DEFAULT_LEGACY_WS_PORT}/api/v1/ws`,
            httpUrl: "https://streamr.network/api/v1",
            storageNode: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
            intervals: {
                "sec": 1000,
                "min": 60000,
                "hour": 3600000,
                "day": 86400000
            }
        }
    },
    streamrUrl: 'https://streamr.network',
    streamrAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
    storageNodeConfig: {
        registry: [{
            address: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
            url: "https://testnet2.streamr.network:8001"
        }]
    },
    httpServer: {
        port: DEFAULT_HTTP_PORT,
        privateKeyFileName: null,
        certFileName: null
    },
    apiAuthentication: null,
    plugins: {
        legacyWebsocket: {
            port: DEFAULT_LEGACY_WS_PORT
        },
        testnetMiner: {
            rewardStreamId: "streamr.eth/brubeck-testnet/rewards",
            claimServerUrl: "http://testnet2.streamr.network:3011",
            maxClaimDelay: 5000
        }
    }
}

export let prompts: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = [
    {
        type: 'list',
        name:'generateOrImportEthereumPrivateKey',
        message: 'Do you want to generate a new Ethereum private key or import an existing one?',
        choices: ['Generate', 'Import']
    },
    {
        type: 'input',
        name:'importPrivateKey',
        message: 'Please provide the private key to import',
        when: (answers: inquirer.Answers) => {
            return answers.generateOrImportEthereumPrivateKey === 'Import'
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

const pluginTemplates = {
    websocket: {
        port: DEFAULT_WS_PORT
    },
    mqtt: {
        port: DEFAULT_MQTT_PORT,
        payloadMetadata: false,
        sslCertificate: null
    },
    legacyPublishHttp: {
        port: DEFAULT_HTTP_PORT
    }
}

const pluginSelectorPrompt = {
    type: 'checkbox',
    name:'selectPlugins',
    message: 'Select the plugins to enable',
    choices: Object.keys(pluginTemplates)
}

const pluginPrompts = Object.values(pluginTemplates).map((plugin, i) => {
    const pluginName = Object.keys(pluginTemplates)[i]
    return {
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
    }
})

prompts = prompts.concat(pluginSelectorPrompt).concat(pluginPrompts)

export const getConfigFromAnswers = (answers: any): Config => {
    const config = DEFAULT_CONFIG
    const pluginNames = Object.keys(pluginTemplates)
    const pluginTemplatesArray = Object.values(pluginTemplates)
    for (let i = 0; i < pluginTemplatesArray.length; i++){
        const name = pluginNames[i]
        const template = pluginTemplatesArray[i]
        if (answers.selectPlugins && answers.selectPlugins.includes(name)){
            config.plugins[name] = { ...template, port: answers[`${name}Port`] }
        }
    }

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
            const parentDirPath = filePath.substring(0, filePath.lastIndexOf('/'))

            answers.parentDirPath = parentDirPath
            answers.parentDirExists = existsSync(parentDirPath)
            answers.fileExists = existsSync(filePath)

            if (!answers.parentDirExists && !answers.fileExists){
                return false
            }
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

export const createStorageFile = (config: Config, answers: inquirer.Answers): string => {
    if (!answers.parentDirExists) {
        mkdirSync(answers.parentDirPath)
    }
   
    writeFileSync(answers.selectDestinationPath, JSON.stringify(config))
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
        logger(`Stored config under ${destinationPath}`)
        logger(`You can start the broker now with`)
        logger.info(`streamr-broker ${destinationPath}`)
    } catch (e) {
        logger.warn('Broker Config Wizard encountered an error:')
        logger.error(e.message)
    }
}