import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { Config } from './config'
import path from 'path'
import { writeFileSync, existsSync } from 'fs'
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


export const generateOrImportEthereumPrivateKey = {
    type: 'list',
    name:'generateOrImportEthereumPrivateKey',
    message: 'Do you want to generate a new Ethereum private key or import an existing one?',
    choices: ['Generate', 'Import'],
    default: (answers:inquirer.Answers) => {
        const wallet = Wallet.createRandom()
        answers.config.ethereumPrivateKey = wallet.privateKey
    }
}

export const importPrivateKey = {
    type: 'input',
    name:'importPrivateKey',
    message: 'Please provide the private key to import',
    when: (answers: inquirer.Answers) => {
        return answers.generateOrImportEthereumPrivateKey === 'Import'
    },
    validate: (input:string, answers: inquirer.Answers):string | boolean | Promise<string | boolean> => {
        try {
            const wallet = new Wallet(input) 
            answers.config.ethereumPrivateKey = wallet.privateKey
            return true
        } catch (privateKeyError) {
            return `Invalid privateKey provided for import: ${input}`
        }

    }
}

export const selectedPlugins = {
    type: 'checkbox',
    name:'selectedPlugins',
    message: 'Select the plugins to enable',
    choices: [
        'Websocket',
        'MQTT',
        'HttpPublish'
    ]             
}

export const wsPort = {
    type: 'input',
    name: 'wsPort',
    message: `Select a port for the Websocket Plugin [Enter for default: ${DEFAULT_WS_PORT}]`,
    when: (answers: inquirer.Answers) => {
        return answers.selectedPlugins.includes('Websocket')
    },
    validate: (input:string, answers: inquirer.Answers):string | boolean | Promise<string | boolean> => {
        const portNumber = parseInt(input || answers.wsPort)
        if (Number.isNaN(portNumber) || !Number.isInteger(portNumber)) {
            return `Non-numeric value ${portNumber} provided`
        }

        if (portNumber < 1024 || portNumber > 49151) {
            return `Out of range port ${portNumber} provided (valid range 1024-49151)`
        }

        answers.config.plugins['websocket'] = {
            port: portNumber
        }
        return true 
    },
    default: DEFAULT_WS_PORT
}

export const mqttPort = {
    type: 'input',
    name: 'mqttPort',
    message: `Select a port for the MQTT Plugin [Enter for default: ${DEFAULT_MQTT_PORT}]`,
    when: (answers: inquirer.Answers) => {
        return answers.selectedPlugins.includes('MQTT')
    },
    validate: (input:string, answers: inquirer.Answers):string | boolean | Promise<string | boolean> => {
        const portNumber = parseInt(input || answers.mqttPort)
        if (Number.isNaN(portNumber) || !Number.isInteger(portNumber)) {
            return `Non-numeric value ${portNumber} provided`
        }

        if (portNumber < 1024 || portNumber > 49151) {
            return `Out of range port ${portNumber} provided (valid range 1024-49151)`
        }

        answers.config.plugins['mqtt'] = {
            port: portNumber,
            payloadMetadata: false,
            sslCertificate: null
        }
        return true 
    },
    default: DEFAULT_MQTT_PORT
}

export const httpPort = {
    type: 'input',
    name: 'httpPort',
    message: `Select a port for the HttpPublish Plugin [Enter for default: ${DEFAULT_HTTP_PORT}]`,
    when: (answers: inquirer.Answers) => {
        return answers.selectedPlugins.includes('HttpPublish')
    },
    validate: (input:string, answers: inquirer.Answers):string | boolean | Promise<string | boolean> => {
        const portNumber = parseInt(input || answers.httpPort)
        if (Number.isNaN(portNumber) || !Number.isInteger(portNumber)) {
            return `Non-numeric value ${portNumber} provided`
        }

        if (portNumber < 1024 || portNumber > 49151) {
            return `Out of range port ${portNumber} provided (valid range 1024-49151)`
        }

        answers.config.plugins['legacyPublishHttp'] = {
            port: portNumber
        }
        return true 
    },
    default:  DEFAULT_HTTP_PORT
}


async function selectValidDestinationPath (config:Config): Promise<string | undefined> {
    const storageAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'destinationFolderPath',
            message: `Select a path to store the generated config in `,
            default: path.join(os.homedir(), '.streamr/broker-config.json'),
            validate: async (input:string, answers: inquirer.Answers):Promise<string | boolean> => {
                answers.clearPath = !existsSync(input || answers.destinationFolderPath)
                return true
            }
            
        }
    ])

    if (!storageAnswers.clearPath) {
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
                writeFileSync(storageAnswers.destinationFolderPath, JSON.stringify(config, null, 2))
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


async function inquirerPromptWithConfig(): Promise<Config> {
    const config:Config = DefaultConfig 

    const prompts:Array<inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion> = [
        generateOrImportEthereumPrivateKey,
        importPrivateKey,
        selectedPlugins,
        wsPort,
        mqttPort,
        httpPort
    ]
    
    const answers = await inquirer.prompt(prompts, {config})
    return answers.config
}

    

export async function startBrokerConfigWizard(): Promise<void> {
    const config = await inquirerPromptWithConfig()
    logger.info(`This will be your node's address: ${new Wallet(config.ethereumPrivateKey).address}`)
    logger.info('This is your node\'s private key. Please store it in a secure location:')
    logger.alert(config.ethereumPrivateKey)
    const storePath = await selectValidDestinationPath(config)
    logger.log(`JSON config: ${JSON.stringify(config)}`)
    logger.info('Broker Config Wizard ran succesfully')
    logger.log(`Stored config under ${storePath}`)
    logger.log(`You can start the broker now with`)
    logger.info(`streamr-broker-init ${storePath}`)
}
