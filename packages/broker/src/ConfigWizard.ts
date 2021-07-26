import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

import { Config } from './config'

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

const DefaultConfig: Config = {
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

export class ConfigWizard{
    config: Config
    // required to mock results on tests
    inquirer: inquirer.Inquirer = inquirer

    constructor() {
        this.config = DefaultConfig
    }

    private async inquirerSinglePrompt(prompt: inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion) {
        const answers = await this.inquirer.prompt([prompt])
        return answers[prompt.name!]
    }

    private async promptNumberWithDefault(prompt: inquirer.InputQuestion, defaultValue: number): Promise<number>{
        const valueString = await this.inquirerSinglePrompt(prompt)
        const value = valueString === '' ? defaultValue: parseInt(valueString)

        if (Number.isNaN(value) || !Number.isInteger(value)) {
            logger.warn(`Non-numeric value [${valueString}] provided`)
            return await this.promptNumberWithDefault(prompt, defaultValue)
        }

        if (value < 1024 || value > 49151) {
            logger.warn(`Out of range port [${value}] provided (valid range 1024-49151)`)
            return await this.promptNumberWithDefault(prompt, defaultValue)
        }

        return value
    }

    private async promptExistingPathWithDefault(prompt: inquirer.InputQuestion, defaultValue: string): Promise<string>{
        const returnedValue = await this.inquirerSinglePrompt(prompt)
        // defaultValue always exists at this point
        if (returnedValue === '') {
            return defaultValue
        }
        
        if (!existsSync(returnedValue)) {
            logger.warn(`Path [${returnedValue}] does not exist`)
            return await this.promptExistingPathWithDefault(prompt, defaultValue)
        }

        return returnedValue
    }

    async generateOrImportPrivateKey(): Promise<Wallet>{
        const generateOrImport = await this.inquirerSinglePrompt({
            type: 'list',
            name:'generateOrImportEthereumPrivateKey',
            message: 'Do you want to generate a new Ethereum private key or import an existing one?',
            choices: ['Generate', 'Import'],
            filter: (choice: string) => {
                return choice.toLowerCase()
            }
        })

        let wallet: Wallet 
        if (generateOrImport === 'generate') {
            wallet = Wallet.createRandom()
            this.config.ethereumPrivateKey = wallet.privateKey
            logger.info('This is your generated private key. Please store it in a secure location')
            logger.alert(this.config.ethereumPrivateKey)
        } else if (generateOrImport === 'import') {
            const privateKey = await this.inquirerSinglePrompt({
                type: 'input',
                name: 'privateKey',
                message: "'Please provide the private key to import'",
            })

            try {
                wallet = new Wallet(privateKey)
                this.config.ethereumPrivateKey = wallet.privateKey
            } catch (privateKeyError) {
                throw new Error(`Invalid privateKey provided for import: ${privateKey}`)
            }

        } else {
            throw new Error(`Invalid option ${generateOrImport} provided`)
        }

        return wallet
    }
    
    async selectPlugins(): Promise<Array<string>>{
        const plugins: inquirer.Answers = await this.inquirerSinglePrompt( {
            type: 'checkbox',
            name:'selectedItems',
            message: 'Select the plugins to enable',
            choices: [
                {name: 'Websocket'},
                {name:'MQTT'},
                {name:'HttpPublish'}
            ]
        })

        const selectedPlugins = []
        for (let i = 0; i < plugins.length; i++) {
            selectedPlugins.push(plugins[i])
            if (plugins[i] === 'Websocket') {
                const wsPort = await this.promptNumberWithDefault({
                    type: 'input',
                    name: 'wsPort',
                    message: `Select a port for the Websocket Plugin [Enter for default: ${DEFAULT_WS_PORT}]`,
                }, DEFAULT_WS_PORT)
                this.config.plugins['websocket'] = {
                    port: wsPort,
                    payloadMetadata: false,
                    sslCertificate: null
                }
            }

            if (plugins[i] === 'MQTT') {
                const mqttPort = await this.promptNumberWithDefault({
                    type: 'input',
                    name: 'mqttPort',
                    message: `Select a port for the MQTT Plugin [Enter for default: ${DEFAULT_MQTT_PORT}]`,
                }, DEFAULT_MQTT_PORT)
                this.config.plugins['mqtt'] = {
                    port: mqttPort,
                    payloadMetadata: false
                }
            }

            if (plugins[i] === 'HttpPublish') {
                this.config.plugins['legacyPublishHttp'] = {}
            }
        }

        return selectedPlugins

    }

    async storeConfig(): Promise<string>{
        const destinationFolder: string = await this.selectDestinationFolder()
        // ensure the destination folder exists
        if (!existsSync(destinationFolder)){
            throw new Error(`Destination folder [${destinationFolder}] does not exist`)
        }
        const filename = `broker-config.json`        
        const finalPath = path.join(destinationFolder, filename)
        // ask the user if they want to overwrite when the file already exists
        if (existsSync(finalPath)){
            const overwrite = await this.inquirerSinglePrompt({
                type: 'confirm',
                name: 'overwrite',
                message: `Config file ${finalPath} already exists. Overwrite?`,
                default: false
            })
            
            if (!overwrite) {
                return this.storeConfig()
            }
        }
        
        writeFileSync(finalPath, JSON.stringify(this.config, null, 2))
        return finalPath
    }

    async selectDestinationFolder(): Promise<string> {
        const defaultDestinationFolder = path.join(os.homedir(), '.streamr')
        if (!existsSync(defaultDestinationFolder)){
            mkdirSync(defaultDestinationFolder)
        }

        return this.promptExistingPathWithDefault({
            type: 'input',
            name: 'destinationFolder',
            message: `Select a path to store the generated config in [Enter for default: ${defaultDestinationFolder}]`,
        }, defaultDestinationFolder)
    }

    async start(): Promise<void> {
        try {
            const wallet = await this.generateOrImportPrivateKey()
            logger.log(`Ethereum Address: ${wallet.address}`)
            logger.log(`Ethereum Private Key: ${wallet.privateKey}`)
            await this.selectPlugins()
            const finalConfigPath = await this.storeConfig()
            logger.log('Broker Config Wizard ran succesfully')
            logger.log(`Stored config under ${finalConfigPath}`)
            logger.log(`You can start the broker now with`)
            logger.info(`streamr-broker-init ${finalConfigPath}`)
        } catch (e){
            logger.error(e)
        }
    }

}

export async function startBrokerConfigWizard (): Promise<void> {
    const wizard = new ConfigWizard()
    return wizard.start()
}
