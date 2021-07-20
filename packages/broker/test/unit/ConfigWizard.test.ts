import { unlinkSync, existsSync } from 'fs'
import { ConfigWizard, startBrokerConfigWizard } from '../../src/ConfigWizard'

const mockPromptMethod = (wizard: ConfigWizard, mockedPromptResult: any) => {
    // simulate input for inquirer based on the `name`poperty of evert prompt
    // @ts-expect-error
    wizard.inquirer.prompt = () => Promise.resolve(mockedPromptResult)
}
describe('ConfigWizard', () => {
    let wizard: ConfigWizard

    beforeEach(async () => {
        wizard = new ConfigWizard()
    })

    afterEach(async () => {
        // @ts-expect-error
        wizard.inquirer.prompt = () => Promise.resolve()
    })

    it('should generate a valid privateKey', async () => {
        mockPromptMethod(wizard, {
            generateOrImportEthereumPrivateKey: 'generate'
        })
        const privateKey = await wizard.generateOrImportPrivateKey()
        expect(privateKey.length).toBe(66)
        expect(privateKey.charAt(0)).toBe('0')
        expect(privateKey.charAt(1)).toBe('x')
        expect(wizard.config.ethereumPrivateKey).toBe(privateKey)
    })

    it ('should import a valid privateKey', async() => {
        const privateKey = '0x8223c67c3c430b75931a4a1620434208749120f7d37204e93bf877e5014499ed'
        mockPromptMethod(wizard, {
            generateOrImportEthereumPrivateKey: 'import',
            privateKey
        })

        const importedPrivateKey = await wizard.generateOrImportPrivateKey()
        expect(importedPrivateKey).toEqual(privateKey)
    })

    it ('should throw when importing an invalid privateKey', async() => {
        const privateKey = '0xNotAValidPrivateKey'
        try {
            mockPromptMethod(wizard, {
                generateOrImportEthereumPrivateKey: 'import',
                privateKey
            })

            await wizard.generateOrImportPrivateKey()
        } catch (e) {
            expect(e.message).toEqual(`Invalid privateKey provided for import: ${privateKey}`)
        }
    })

    it ('should enable every plugin with custom values', async () => {
        const wsPort = 9991
        const mqttPort = 9992
        const httpPort = 9993

        mockPromptMethod(wizard, {
            selectedItems: ['Websocket', 'MQTT', 'HttpPublish'],
            wsPort,
            mqttPort,
            httpPort
        })

        const selected = await wizard.selectPlugins()
        expect(selected).toEqual(['Websocket', 'MQTT', 'HttpPublish'])
        expect(wizard.config.plugins).toEqual({
            legacyWebsocket: {
                port: 7173
            },
            websocket: {
                port: wsPort,
                payloadMetadata: false,
                sslCertificate: null
            },
            mqtt: {
                port: mqttPort,
                payloadMetadata: false
            },
            legacyPublishHttp: {},
            testnetMiner: {
                claimServerUrl: 'http://88.99.104.143:3011',
                maxClaimDelay: 5000,
                rewardStreamId: 'dO1PMm-FThqeWk-SE3zOYg'
            }
        })
    })

    it ('should store the generated config', async () => {
        mockPromptMethod(wizard, {
            generateOrImportEthereumPrivateKey: 'generate',
            selectedItems: ['Websocket', 'MQTT', 'HttpPublish'],
            wsPort: 7170,
            mqttPort: 7171,
            httpPort: 7172
        })

        await wizard.generateOrImportPrivateKey()
        await wizard.selectPlugins()

        const finalPath = await wizard.storeConfig('../configs')
        expect(existsSync(finalPath)).toEqual(true)
        //cleanup
        unlinkSync(finalPath)
        expect(existsSync(finalPath)).toEqual(false)

    })

    it ('should test the entire logic of the config wizard', async() => {
        mockPromptMethod(wizard, {
            generateOrImportEthereumPrivateKey: 'generate',
            selectedItems: ['Websocket', 'MQTT', 'HttpPublish'],
            wsPort: 7170,
            mqttPort: 7171,
            httpPort: 7172
        })
        const finalPath = await startBrokerConfigWizard('../configs')
        expect(existsSync(finalPath)).toEqual(true)
        //cleanup
        unlinkSync(finalPath)
        expect(existsSync(finalPath)).toEqual(false)
    })
    
})