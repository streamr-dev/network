import { terminal } from 'terminal-kit'
import { Wallet } from 'ethers'
import { writeFileSync } from 'fs'
import path from 'path'

export class ConfigWizard {
    readonly singleLineMenuOptions: any = {
        style:terminal.inverse
    }
    constructor(startMessage: string){
        terminal.clear()
        this.log(startMessage)
    }

    log(...args: any){
        terminal.inverse(...args)
    }

    async captureUserOption(
        preText: string, 
        items: Array<string>
    ): Promise<string>{
        return new Promise((resolve, reject) => {
            this.log(preText)
            terminal.singleLineMenu(items, this.singleLineMenuOptions, (err, res) => {
                if (err) {reject (err)}
                resolve(res.selectedText)
            })
        })
    }

    async captureUserInput(
        preText: string
    ): Promise<string>{
        this.log(preText, '[ENTER to finish]')
        
        const input = await terminal.inputField({}).promise 
        return input!.toString()
    }
}

export interface BrokerConfigTemplate {
    ethereumPrivateKey: string
}

export class BrokerConfigWizard extends ConfigWizard{
    config: BrokerConfigTemplate

    constructor(){
        super('Broker Configuration Wizard started')
        this.config = {
            ethereumPrivateKey:''
        }
    }

    log(...args: any){
        super.log("\n[BCW] > ", ...args)
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
        const filename = `broker-config-wizard-${Date.now()}.json`
        const finalPath = path.join(__dirname, destinationFolder, filename)
        writeFileSync(finalPath, JSON.stringify(this.config))
        this.log(`Configuration stored in ${finalPath}`)
        return finalPath
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
    
        wizard.storeConfig(destinationFolder)
        wizard.log('Broker Config Wizard ran succesfully')
    } catch (e){
        console.error('Error running the Broker Config Wizard')
        console.error(e)
    } finally {
        console.log("\n")
        process.exit()
    }
    
}