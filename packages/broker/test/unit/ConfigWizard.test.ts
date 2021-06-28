import { BrokerConfigWizard } from '../../src/ConfigWizard'
import { unlinkSync, existsSync } from 'fs'

describe('ConfigWizard', () => {
    let brokerConfigWizard: BrokerConfigWizard
    let privateKey: string

    beforeEach(async () => {
        brokerConfigWizard = new BrokerConfigWizard()
    })

    it('should generate a valid privateKey', () => {
        privateKey = brokerConfigWizard.generatePrivateKey()
        expect(privateKey.length).toBe(66)
        expect(privateKey.charAt(0)).toBe('0')
        expect(privateKey.charAt(1)).toBe('x')
        expect(brokerConfigWizard.config.ethereumPrivateKey).toBe(privateKey)
    })

    it('should import a valid privateKey', () => {
        brokerConfigWizard.importPrivateKey(privateKey)
        expect(brokerConfigWizard.config.ethereumPrivateKey).toBe(privateKey)
    })

    it ('should throw an error when an invalid privateKey is provided', () => {
        const privateKey = '0xNotValid'
        try {
            brokerConfigWizard.importPrivateKey(privateKey)
        } catch (e){
            expect(e.message).toBe('Invalid privateKey provided for import: 0xNotValid')
        }
    })

    it ('should store (and clean up) a config file', () => {
        brokerConfigWizard.generatePrivateKey()
        const configPath = brokerConfigWizard.storeConfig()
        expect(existsSync(configPath)).toBe(true)
        unlinkSync(configPath)
        expect(existsSync(configPath)).toBe(false)
    })
})