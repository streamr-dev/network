import { Wallet } from 'ethers'
import { writeFileSync, mkdtempSync, existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { CONFIG_WIZARD_PROMPTS, selectDestinationPathPrompt, createStorageFile, getConfigFromAnswers, DEFAULT_CONFIG } from '../../src/ConfigWizard'
import { Config } from '../config'

describe('ConfigWizard', () => {
    const importPrivateKeyPrompt = CONFIG_WIZARD_PROMPTS[1]
    const portPrompt = CONFIG_WIZARD_PROMPTS[3]

    describe('importPrivateKey validate', () => {
        it ('happy path, prefixed', () => {
            const validate = importPrivateKeyPrompt.validate!
            const privateKey = Wallet.createRandom().privateKey
            expect(validate(privateKey)).toBe(true)
        })

        it ('happy path, no prefix', () => {
            const validate = importPrivateKeyPrompt.validate!
            const privateKey = Wallet.createRandom().privateKey.substring(2)
            expect(validate(privateKey)).toBe(true)
        })

        it ('invalid data', () => {
            const validate = importPrivateKeyPrompt.validate!
            const privateKey = '0xInvalidPrivateKey'
            expect(validate(privateKey)).toBe(`Invalid privateKey provided for import: ${privateKey}`)
        })
    })

    describe('plugin port validation', () => {
        it ('happy path', () => {
            const validate = portPrompt.validate!
            expect(validate('7070')).toBe(true)
        })

        it ('invalid data: out-of-range number', () => {
            const validate = portPrompt.validate!
            const port = '10000000000'
            expect(validate(port)).toBe(`Out of range port ${port} provided (valid range 1024-49151)`)
        })

        it ('invalid data: non-numeric', () => {
            const validate = portPrompt.validate!
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
            const validate = selectDestinationPathPrompt.validate!
            const validPath = tmpDataDir + '/test-config.json'
            expect(validate(validPath)).toBe(true)
        })

        it ('invalid path provided', () => {
            const validate = selectDestinationPathPrompt.validate!
            const invalidPath = `/invalid-path/${Date.now()}`
            const answers: any = {}
            const isValid = validate(invalidPath, answers)
            expect(isValid).toBe(false)
            expect(answers.parentDirExists).toBe(false)
            expect(answers.fileExists).toBe(false)

        })
    })

    describe('createStorageFile', () => {
        let tmpDataDir: string
        let config: Config

        beforeAll(() => {
            tmpDataDir = mkdtempSync(path.join(os.tmpdir(), 'broker-test-config-wizard'))
        })

        beforeEach(() => {
            config = DEFAULT_CONFIG as Config
        })

        it ('happy path with overwrite destination', () => {
            const validate = selectDestinationPathPrompt.validate!
            const validPath = tmpDataDir + '/test-config.json'
            writeFileSync(validPath, JSON.stringify({}))
            const answers: any = {}
            const isValid = validate(validPath, answers)
            expect(isValid).toBe(true)
            expect(answers.parentDirExists).toBe(true)
            expect(answers.fileExists).toBe(true)
        })

        it ('happy path; create parent dir when doesn\'t exist', () => {
            const parentDirPath = tmpDataDir + '/newdir/'
            const selectDestinationPath = parentDirPath + 'test-config.json'
            const configFileLocation: string = createStorageFile(config, {
                selectDestinationPath,
                parentDirPath,
                fileExists: false,
                parentDirExists: false,
            })
            expect(configFileLocation).toBe(selectDestinationPath)
            expect(existsSync(configFileLocation)).toBe(true)
        })

        it ('should throw when attempting to mkdir on existing path', () => {
            try {
                const parentDirPath = '/home/'
                createStorageFile(config, {
                    parentDirPath,
                    parentDirExists: false,
                })
            } catch(e){
                expect(e.code).toBe('EEXIST')
                expect(e.syscall).toBe('mkdir')
            }
        })

        it ('should throw when no permissions on path', () => {
            try {
                const parentDirPath = '/home/'
                const selectDestinationPath = parentDirPath + 'test-config.json'
                createStorageFile(config, {
                    selectDestinationPath,
                    parentDirPath,
                    fileExists: false,
                    parentDirExists: true,
                })
            } catch(e){
                expect(e.code).toBe('EACCES')
                expect(e.syscall).toBe('open')
            }
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
                selectPlugins:['websocket'],
                websocketPort: port,
            }
            const config = getConfigFromAnswers(answers)
            expect(config.plugins.websocket.port).toBe(port)
        })

        it('should exercise the happy path for the answers to config', () => {
            const answers = {
                generateOrImportEthereumPrivateKey: 'Generate',
                selectPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: 3170,
                mqttPort: 3171,
                publishHttpPort: 3172
            }
            const config = getConfigFromAnswers(answers)
            expect(config.plugins.websocket.port).toBe(answers.websocketPort)
            expect(config.plugins.mqtt.port).toBe(answers.mqttPort)
            expect(config.plugins.publishHttp.port).toBe(answers.publishHttpPort)
            expect(config.ethereumPrivateKey.match(/^(0x)?[a-f0-9]{64}$/)).not.toBe(null)
        })
    })
})
