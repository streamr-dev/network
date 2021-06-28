import inquirer from 'inquirer'
import { Wallet } from 'ethers'
import { writeFileSync } from 'fs'
import path from 'path'

export class ConfigWizard {
    readonly singleLineMenuOptions: any = {
    }
    constructor(startMessage: string){
        this.log(startMessage)
    }

    log(...args: any){
        console.log(...args)
    }

    async captureMultipleOption(
        preText: string,
        items: Array<{[key: string]: string}>
    ) {
        const res = await inquirer.prompt([
            {
                type: 'checkbox',
                name:'selectedItems',
                message: preText,
                choices: items
            }
        ])

        return res.selectedItems
    }

    async captureUserOption(
        preText: string, 
        items: Array<string>
    ): Promise<string>{
        const res = await inquirer.prompt([
            {
                type: 'list',
                name: 'optionList',
                message: preText,
                choices: items,

            }
        ])

        return res.optionList   
    }

    async captureUserInput(
        preText: string
    ): Promise<string>{
        preText += ' > '        
        const input = await inquirer.prompt([
            {
                type:'input',
                name:'text',
                message:preText
            }
        ])

        return input.text
    }
}

export interface PluginTemplateType {
    port: number
}
export interface BrokerConfigTemplate {
    ethereumPrivateKey: string
    plugins: {[plugin: string]: PluginTemplateType}
}

export class BrokerConfigWizard extends ConfigWizard{
    config: BrokerConfigTemplate

    constructor(){
        console.clear()
        super('Broker Configuration Wizard started')
        this.config = {
            ethereumPrivateKey:'',
            plugins:{}
        }
    }

    generatePrivateKey(): string{
        const wallet = Wallet.createRandom()
        this.config.ethereumPrivateKey = wallet.privateKey
        return wallet.privateKey
    }

    importPrivateKey(privateKey: string){
        try {
            const wallet = new Wallet(privateKey)
            this.config.ethereumPrivateKey = wallet.privateKey
        } catch (e){
            throw new Error(`Invalid privateKey provided for import: ${privateKey}`)
        }

    }

    storeConfig(destinationFolder = '../configs/'){
        const filename = `wizard-config.json`
        const finalPath = path.join(__dirname, destinationFolder, filename)
        writeFileSync(finalPath, JSON.stringify(this.config))
        this.log(`Configuration stored in ${finalPath}`)
        return finalPath
    }

    async selectPlugins(){
        const res = await this.captureMultipleOption('Select the plugins to enable', 
            [
                {name: 'Websocket'},
                {name:'MQTT'},
                {name:'HttpPublish'}
            ]
        )

        const defaultWebsocketPort = 7171 
        const defaultMqttPort = 7272 
        const defaultHttpPort = 7373

        for (let i = 0; i < res.length; i++){
            if (res[i] === 'Websocket'){
                const portString = await this.captureUserInput(`Select a port for the Websocket Plugin [Enter for default: ${defaultWebsocketPort}]`)
                let port = parseInt(portString)
                if (portString === '') {
                    port = defaultWebsocketPort
                }

                if (!Number.isNaN(port) && Number.isInteger(port) && port > 1023 && port < 49151){
                    this.config.plugins['websocket'] = { port }
                }
            }

            if (res[i] === 'MQTT'){
                const portString = await this.captureUserInput(`Select a port for the MQTT Plugin [Enter for default: ${defaultMqttPort}]`)
                let port = parseInt(portString)
                if (portString === '') {
                    port = defaultMqttPort
                }
                if (!Number.isNaN(port) && Number.isInteger(port) && port > 1023 && port < 49151){
                    this.config.plugins['mqtt'] = { port }
                }

            }

            if (res[i] === 'HttpPublish'){
                const portString = await this.captureUserInput(`Select a port for the HttpPublish Plugin [Enter for default: ${defaultHttpPort}]`)
                let port = parseInt(portString)
                if (portString === '') {
                    port = defaultHttpPort
                }

                if (!Number.isNaN(port) && Number.isInteger(port) && port > 1023 && port < 49151){
                    this.config.plugins['httpPublish'] = { port }
                }

            }
        }

    }
}

export async function startBrokerConfigWizard (destinationFolder?: string) {
    try {
        const wizard = new BrokerConfigWizard()
        const generateOrImport = await wizard.captureUserOption('Do you want to generate a new Ethereum private key or import an existing one?', ['Generate', 'Import'])
    
        if (generateOrImport === 'Generate'){
            wizard.generatePrivateKey()
        } else if (generateOrImport === 'Import'){
            const privateKey = await wizard.captureUserInput('Please provide the private key to import')
            wizard.importPrivateKey(privateKey)
        } else {
            throw new Error(`Invalid option ${generateOrImport} provided`)
        }

        // enable selected plugins 
        await wizard.selectPlugins()
    
        wizard.storeConfig(destinationFolder)
        wizard.log('Broker Config Wizard ran succesfully')
        wizard.log('Generated configuration:', wizard.config)
    } catch (e){
        console.error('Error running the Broker Config Wizard')
        console.error(e)
    } finally {
        console.log("\n")
        process.exit()
    }
    
}