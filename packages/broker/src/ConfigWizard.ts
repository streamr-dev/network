import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { writeFileSync } from 'fs'
import path from 'path'

import { Config } from './config'

import { Logger } from 'streamr-network'

const logger = new Logger(module)

const TODO_VALUES = {
    number:-1,
    string: 'empty_str',
}

// the lines with a TODO comment have values similar to the dev configs but need a revision to ensure the values are as they should
const DefaultConfig: Config = {
    ethereumPrivateKey: TODO_VALUES.string,//'{ETHEREUM_PRIVATE_KEY}',
    network: {
        name: TODO_VALUES.string,
        hostname: '127.0.0.1', // TODO
        port: TODO_VALUES.number,
        advertisedWsUrl: null,
        trackers: [ // TODO
            "ws://127.0.0.1:30301",
            "ws://127.0.0.1:30302",
            "ws://127.0.0.1:30303"
        ],
        location: {
            latitude: 60.19,
            longitude: 24.95,
            country: "Finland",
            city: "Helsinki"
        } // TODO
    },
    reporting: {
        intervalInSeconds: 0,
        streamr: null,
        perNodeMetrics: null
    },
    streamrUrl: 'http://127.0.0.1', // TODO
    streamrAddress: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c', // TODO
    storageNodeConfig: {
        registry: {
            contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F', // TODO
            jsonRpcProvider: 'http://10.200.10.1:8546' // TODO
        }
    },
    httpServer: {
        privateKeyFileName: null,
        certFileName: null,
        port: TODO_VALUES.number//'{HTTP_SERVER_PORT}',
    },
    apiAuthentication: null,
    plugins: {}
}

export class ConfigWizard{
    config: Config
    // required to mock results on tests
    inquirer: inquirer.Inquirer = inquirer

    defaultWebsocketPort = 7171 
    defaultMqttPort = 7272 
    defaultHttpPort = 7373

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
                    message: `Select a port for the Websocket Plugin [Enter for default: ${this.defaultWebsocketPort}]`,
                }, this.defaultWebsocketPort)
                this.config.plugins['websocket'] = { port: wsPort }
            }

            if (plugins[i] === 'MQTT') {
                const mqttPort = await this.promptNumberWithDefault({
                    type: 'input',
                    name: 'mqttPort',
                    message: `Select a port for the MQTT Plugin [Enter for default: ${this.defaultMqttPort}]`,
                }, this.defaultMqttPort)
                this.config.plugins['mqtt'] = { port: mqttPort }
            }

            if (plugins[i] === 'HttpPublish') {
                const httpPort = await this.promptNumberWithDefault({
                    type: 'input',
                    name: 'httpPort',
                    message: `Select a port for the HttpPublish Plugin [Enter for default: ${this.defaultHttpPort}]`,
                }, this.defaultHttpPort)
                this.config.plugins['httpPublish'] = { port: httpPort }
            }
        }

        return selectedPlugins

    }

    async storeConfig(destinationFolder: string) {
        const filename = `wizard-config.json`
        const finalPath = path.join(__dirname, destinationFolder, filename)
        writeFileSync(finalPath, JSON.stringify(this.config))
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