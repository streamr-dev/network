import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

import { Config } from './config'

import * as os from 'os'

const logger = {
    info: (...args: any[]) => {
        console.log('\x1b[7m' + ':' + '\x1b[0m', ...args)
    },
    warn: (...args: any[]) => {
        console.log('\x1b[33m' + '!' + '\x1b[0m', ...args)
    },
    error: (...args: any[]) => {
        console.log('\x1b[31m' + '!' + '\x1b[0m', ...args)
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
        trackers: [{
            ws: "wss://testnet1.streamr.network:30300",
            http: "https://testnet1.streamr.network:30300",
            id: "0x49D45c17bCA1Caf692001D21c38aDECCB4c08504"
        }],
        location: null,
        stun: "stun:stun.turn.streamr.network:5349",
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
        },
        metrics: {
            consoleLogIntervalInSeconds: 0,
            legacyMetricsStreamId: null,
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

    async generateOrImportPrivateKey(): Promise<string>{
        const generateOrImport = await this.inquirerSinglePrompt({
            type: 'list',
            name:'generateOrImportEthereumPrivateKey',
            message: 'Do you want to generate a new Ethereum private key or import an existing one?',
            choices: ['Generate', 'Import'],
            filter: (choice: string) => {
                return choice.toLowerCase()
            }
        })

        if (generateOrImport === 'generate') {
            this.config.ethereumPrivateKey = Wallet.createRandom().privateKey
        } else if (generateOrImport === 'import') {
            const privateKey = await this.inquirerSinglePrompt({
                type: 'input',
                name: 'privateKey',
                message: "'Please provide the private key to import'",
            })

            try {
                const wallet = new Wallet(privateKey)
                this.config.ethereumPrivateKey = wallet.privateKey
            } catch (privateKeyError) {
                throw new Error(`Invalid privateKey provided for import: ${privateKey}`)
            }

        } else {
            throw new Error(`Invalid option ${generateOrImport} provided`)
        }

        return this.config.ethereumPrivateKey
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

    async storeConfig(destinationFolder: string) {
        if (!existsSync(destinationFolder)){
            throw new Error(`Destination folder [${destinationFolder}] does not exist`)
        }
        const filename = `broker-config.json`        
        const finalPath = path.join(destinationFolder, filename)
        
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
            await this.generateOrImportPrivateKey()
            await this.selectPlugins()
            const destinationFolder: string = await this.selectDestinationFolder()
            const finalConfigPath = await this.storeConfig(destinationFolder)
            logger.info('Broker Config Wizard ran succesfully')
            logger.info('Generated configuration:', this.config)
            logger.info(`Stored config under ${finalConfigPath}`)
            logger.info(`You can start the broker now with \n streamr-broker-init ${finalConfigPath}`)
        } catch (e){
            logger.error(e)
        }
    }

}

export async function startBrokerConfigWizard (): Promise<void> {
    const wizard = new ConfigWizard()
    return wizard.start()
}
