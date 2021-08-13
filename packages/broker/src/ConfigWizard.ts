import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { Config } from './config'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import * as os from 'os'

const logger = {
    log: (...args: any[]) => {
        console.log('\x1b[7m' + ':' +'\x1b[0m', ...args)
    },
    info: (...args: any[]) => {
        console.log('\x1b[47m' +  '\x1b[30m' + ':', ...args, '\x1b[0m')
    },
    warn: (...args: any[]) => {
        console.log('\x1b[33m' + '!' + '\x1b[0m', ...args)
    },
    error: (...args: any[]) => {
        console.log('\x1b[31m' + '!' + '\x1b[0m', ...args)
    },
    alert:(...args: any[]) => {
        console.log('\x1b[43m' + '\x1b[30m' + '!', ...args, '\x1b[0m')
    }
}

const DEFAULT_WS_PORT = 7170
const DEFAULT_MQTT_PORT = 7171
const DEFAULT_HTTP_PORT = 7172
const DEFAULT_LEGACY_WS_PORT = 7173

export const DefaultConfig: Config = {
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

export const basicPrompts: Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = [
    {
        type: 'list',
        name:'generateOrImportEthereumPrivateKey',
        message: 'Do you want to generate a new Ethereum private key or import an existing one?',
        choices: ['Generate', 'Import'],
        default: (answers: inquirer.Answers) => {
            const wallet = Wallet.createRandom()
            answers.ethereumPrivateKey = wallet.privateKey
        }
    },
    {
        type: 'input',
        name:'importPrivateKey',
        message: 'Please provide the private key to import',
        when: (answers: inquirer.Answers) => {
            return answers.generateOrImportEthereumPrivateKey === 'Import'
        },
        validate: (input: string, answers: inquirer.Answers = {}): string | boolean => {
            try {
                const wallet = new Wallet(input) 
                answers.ethereumPrivateKey = wallet.privateKey
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

// Plugin config
const pluginTemplates = [
    {
        key: 'websocket', // used to reference config.plugins[key]
        config: {
            port: DEFAULT_WS_PORT
        }
    },
    {
        key: 'mqtt',
        config: {
            port: DEFAULT_MQTT_PORT,
            payloadMetadata: false,
            sslCertificate: null
        }
    },
    {
        key: 'legacyPublishHttp',
        config: {
            port: DEFAULT_HTTP_PORT
        }
    },
]

export const pluginSelectorPrompt = {
    type: 'checkbox',
    name:'selectedPlugins',
    message: 'Select the plugins to enable',
    choices: pluginTemplates.map((plugin) => plugin.key)
}

export const pluginPrompts = pluginTemplates.map((plugin) => {
    return {
        type: 'input',
        name: `${plugin.key}-port`,
        message: `Select a port for the ${plugin.key} Plugin [Enter for default: ${plugin.config.port}]`,
        when: (answers: inquirer.Answers) => {
            return answers.selectedPlugins.includes(plugin.key)
        },
        validate: (input: string, answers: inquirer.Answers = {plugins:{}}): string | boolean => {
            const portNumber = parseInt(input || answers[`${plugin.key}-port`])
            if (Number.isNaN(portNumber) || !Number.isInteger(portNumber)) {
                return `Non-numeric value ${input} provided`
            }
    
            if (portNumber < 1024 || portNumber > 49151) {
                return `Out of range port ${portNumber} provided (valid range 1024-49151)`
            }
    
            answers.plugins[plugin.key] = plugin.config 
            answers.plugins[plugin.key].port = portNumber
            return true 
        },
        default: plugin.config.port
    }
})

export const StorageAnswersPrompt = {
    type: 'input',
    name: 'destinationFolderPath',
    message: `Select a path to store the generated config in `,
    default: path.join(os.homedir(), '.streamr/broker-config.json'),
    validate: (input: string, answers: inquirer.Answers = {}): string | boolean => {
        const path = input || answers.destinationFolderPath
        const dirPath = path.substring(0, path.lastIndexOf('/'))

        answers.clearPath = !existsSync(path)
        if (answers.clearPath && !existsSync(dirPath)){
            mkdirSync(dirPath)
        }
        return true
    }
    
}

async function selectValidDestinationPath (config: Config): Promise<string | undefined> {
    
    const storageAnswers = await inquirer.prompt([StorageAnswersPrompt])
    if (storageAnswers.clearPath) {
        writeFileSync(storageAnswers.destinationFolderPath, JSON.stringify(config))
        return storageAnswers.destinationFolderPath
    } else {
        const confirmOverwrite = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `The selected destination ${storageAnswers.destinationFolderPath} already exists, do you want to overwrite it?`,
                default: false,
            }
        ])

        if (confirmOverwrite.confirm) {
            try {
                writeFileSync(storageAnswers.destinationFolderPath, JSON.stringify(config))
                return storageAnswers.destinationFolderPath
            } catch (e) {
                logger.error(e)
                return e.message
            }
        } else {
            return selectValidDestinationPath(config)
        }
    }
}

export const getConfigFromAnswers = (answers: any): Config => {
    const config = DefaultConfig 
    config.ethereumPrivateKey = answers.ethereumPrivateKey

    const plugins = Object.keys(answers.plugins)
    for (let i = 0; i < plugins.length; i++){
        config.plugins[plugins[i]] = answers.plugins[plugins[i]]
    }
    return config
}

export async function startBrokerConfigWizard(): Promise<void> {
    const answers = {plugins:{}}
    const prompts = basicPrompts.concat(pluginSelectorPrompt).concat(pluginPrompts)       
    const capturedAnswers = await inquirer.prompt(prompts, answers)
    console.log('answers', answers, capturedAnswers)
    logger.info(`This will be your node's address: ${new Wallet(capturedAnswers.ethereumPrivateKey).address}`)
    logger.info('This is your node\'s private key. Please store it in a secure location:')
    logger.alert(capturedAnswers.ethereumPrivateKey)
    const config = getConfigFromAnswers(capturedAnswers)
    const storePath = await selectValidDestinationPath(config)
    logger.log(`JSON config: ${JSON.stringify(config)}`)
    logger.info('Broker Config Wizard ran succesfully')
    logger.log(`Stored config under ${storePath}`)
    logger.log(`You can start the broker now with`)
    logger.info(`streamr-broker-init ${storePath}`)
}
