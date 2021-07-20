import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { writeFileSync } from 'fs'
import path from 'path'

import { Config } from './config'

import { Logger } from 'streamr-network'

const logger = new Logger(module)

const DEFAULT_WS_PORT = 7170
const DEFAULT_MQTT_PORT = 7171
const DEFAULT_HTTP_PORT = 7172
const DEFAULT_LEGACY_WS_PORT = 7173

const DefaultConfig: Config = {
    ethereumPrivateKey: '',
    network: {
        name: 'miner-node',
        trackers: [
            "ws://95.216.64.56:30300"
        ],
        location: null
    },
    reporting: {
        intervalInSeconds: 0,
        streamr: null,
        perNodeMetrics: null
    },
    streamrUrl: 'https://streamr.network',
    streamrAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
    storageNodeConfig: {
        registry: [{
            address: "0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916",
            url: "http://95.216.64.56:8001"
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
            rewardStreamId: "dO1PMm-FThqeWk-SE3zOYg",
            claimServerUrl: "http://88.99.104.143:3011",
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

    async inquirerSinglePrompt(prompt: inquirer.Question | inquirer.ListQuestion | inquirer.CheckboxQuestion) {
        const answers = await this.inquirer.prompt([prompt])
        return answers[prompt.name!]
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

    async promptNumberWithDefault(prompt: inquirer.InputQuestion, defaultValue: number): Promise<number>{
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
        const filename = `wizard-config.json`
        const finalPath = path.join(__dirname, destinationFolder, filename)
        writeFileSync(finalPath, JSON.stringify(this.config, null, 2))
        return finalPath
    }

    async start(destinationFolder: string) {
        await this.generateOrImportPrivateKey()
        await this.selectPlugins()
        const finalConfigPath = await this.storeConfig(destinationFolder)
        logger.info('Broker Config Wizard ran succesfully')
        logger.info('Generated configuration:', this.config)
        logger.info(`Stored config under ${finalConfigPath}`)
        logger.info(`You can start the broker now with \n streamr-broker ${finalConfigPath}`)
        return finalConfigPath
    }

}

export async function startBrokerConfigWizard (destinationFolder  = '../configs/'): Promise<string> {
    const wizard = new ConfigWizard()
    return wizard.start(destinationFolder)
}
