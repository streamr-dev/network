import { Wallet } from 'ethers'
import { writeFileSync, mkdtempSync } from 'fs'
import os from 'os'
import path from 'path'
import { prompts, storagePrompt, getConfigFromAnswers } from '../../src/ConfigWizard'

describe('ConfigWizard', () => {
    describe('importPrivateKey validate', () => {
        it ('happy path', () => {
            const validate = prompts[1].validate!
            const privateKey = Wallet.createRandom().privateKey
            expect(validate(privateKey)).toBe(true)
        })

        it ('invalid data', () => {
            const validate = prompts[1].validate!
            const privateKey = '0xInvalidPrivateKey'
            expect(validate(privateKey)).toBe(`Invalid privateKey provided for import: ${privateKey}`)
        })
    })

    describe('plugin port validation', () => {
        it ('happy path', () => {
            const validate = prompts[3].validate!
            expect(validate('7070')).toBe(true)
        })

        it ('invalid data: out-of-range number', () => {
            const validate = prompts[3].validate!
            const port = '10000000000'
            expect(validate(port)).toBe(`Out of range port ${port} provided (valid range 1024-49151)`)
        })

        it ('invalid data: non-numeric', () => {
            const validate = prompts[3].validate!
            const port = 'Not A Number!'
            expect(validate(port)).toBe(`Non-numeric value provided`)
        })
    })

    describe('storagePrompt validation', () => {
        let tmpDataDir: string

        beforeAll(() => {
            tmpDataDir = mkdtempSync(path.join(os.tmpdir(), 'broker-test-config-wizard'))
        })
        it ('happy path', () => {
            const validate = storagePrompt.validate!
            const validPath = tmpDataDir + '/test-config.json'
            expect(validate(validPath)).toBe(true)
        })

        it ('invalid path provided', () => {
            const validate = storagePrompt.validate!
            const invalidPath = 'invalid-path'
            expect(validate(invalidPath)).toBe('ENOENT: no such file or directory, mkdir')
        })

        it ('happy path with overwrite destination', () => {
            const validate = storagePrompt.validate!
            const validPath = tmpDataDir + '/test-config.json'
            writeFileSync(validPath, JSON.stringify({}))
            const answers: any = {}
            const isValid = validate(validPath, answers)
            expect(isValid).toBe(true)
            expect(answers.clearPath).toBe(false)
        })
    })

    describe('getConfigFromAnswers', () => {
        it ('should exercise the `generate` path', () => {
            const answers = {
                generateOrImportEthereumPrivateKey: 'Generate',
            }
            const config = getConfigFromAnswers(answers)
            expect(config.ethereumPrivateKey).toBeDefined()
            expect(config.ethereumPrivateKey.match(/^(0x)?[a-f0-9]{64}$/)).not.toBe(null)
        })

        it ('should exercise the `import` path', () => {
            const privateKey = Wallet.createRandom().privateKey
            const answers = {
                generateOrImportEthereumPrivateKey: 'Import',
                importPrivateKey: privateKey,
            }
            const config = getConfigFromAnswers(answers)
            expect(config.ethereumPrivateKey).toBe(privateKey)
        })

        it ('should exercise the plugin port assignation path', () => {
            const port = '3737'
            const answers = {
                generateOrImportEthereumPrivateKey: 'Generate',
                selectedPlugins:['websocket'],
                websocketPort: port,
            }
            const config = getConfigFromAnswers(answers)
            expect(config.plugins.websocket.port).toBe(port)
        })

        it('should exercise the happy path for the answers to config', () => {
            const answers = {
                generateOrImportEthereumPrivateKey: 'Generate',
                selectedPlugins: [ 'websocket', 'mqtt', 'legacyPublishHttp' ],
                websocketPort: 3170,
                mqttPort: 3171,
                legacyPublishHttpPort: 3172
            }
            const config = getConfigFromAnswers(answers)
            expect(config.plugins.websocket.port).toBe(answers.websocketPort)
            expect(config.plugins.mqtt.port).toBe(answers.mqttPort)
            expect(config.plugins.legacyPublishHttp.port).toBe(answers.legacyPublishHttpPort)
            expect(config.ethereumPrivateKey.match(/^(0x)?[a-f0-9]{64}$/)).not.toBe(null)
        })
    })

})
