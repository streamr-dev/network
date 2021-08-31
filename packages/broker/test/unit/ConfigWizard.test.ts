import { Wallet } from 'ethers'
import { writeFileSync, mkdtempSync, existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { CONFIG_WIZARD_PROMPTS, DEFAULT_CONFIG_PORTS, selectDestinationPathPrompt, createStorageFile, getConfigFromAnswers, getPrivateKeyFromAnswers, generateMiscFromConfig } from '../../src/ConfigWizard'

const assertValidPort = (port: number | string, pluginName = 'websocket') => {
    const numericPort = (typeof port === 'string') ? parseInt(port) : port
    const privateKeyAnswers = {
        generateOrImportEthereumPrivateKey: 'Generate',
    }
    const pluginsAnswers = {
        selectPlugins:[pluginName],
        websocketPort: port,
    }
    const ethereumPrivateKey = getPrivateKeyFromAnswers(privateKeyAnswers)
    const config = getConfigFromAnswers(ethereumPrivateKey, pluginsAnswers)
    expect(config.plugins[pluginName].port).toBe(numericPort)
}

const assertValidMisc = (config: any) => {
    const misc = generateMiscFromConfig(config)
    expect(misc.mnemonic).toBeDefined()
    expect(misc.networkExplorerUrl).toBeDefined()
}

describe('ConfigWizard', () => {
    const importPrivateKeyPrompt = CONFIG_WIZARD_PROMPTS.privateKey[1]
    const portPrompt = CONFIG_WIZARD_PROMPTS.plugins[1]

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
        it ('happy path: numeric value', () => {
            const validate = portPrompt.validate!
            expect(validate(7070)).toBe(true)
        })

        it ('happy path: string value', () => {
            const validate = portPrompt.validate!
            expect(validate('7070')).toBe(true)
        })

        it ('invalid data: out-of-range number', () => {
            const validate = portPrompt.validate!
            const port = 10000000000
            expect(validate(port)).toBe(`Out of range port ${port} provided (valid range 1024-49151)`)
        })

        it ('invalid data: float-point number', () => {
            const validate = portPrompt.validate!
            const port = 55.55
            expect(validate(port)).toBe(`Non-integer value provided`)
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

        it ('invalid path provided', () => {
            const validate = selectDestinationPathPrompt.validate!
            const invalidPath = `/invalid-path/${Date.now()}`
            const answers: any = {}
            const isValid = validate(invalidPath, answers)
            expect(isValid).toBe(true)
            expect(answers.parentDirExists).toBe(false)
            expect(answers.fileExists).toBe(false)

        })
    })

    describe('createStorageFile', () => {
        const CONFIG: any = {}
        let tmpDataDir: string

        beforeAll(() => {
            tmpDataDir = mkdtempSync(path.join(os.tmpdir(), 'broker-test-config-wizard'))
        })

        it ('happy path; create parent dir when doesn\'t exist', async () => {
            const parentDirPath = tmpDataDir + '/newdir/'
            const selectDestinationPath = parentDirPath + 'test-config.json'
            const configFileLocation: string = await createStorageFile(CONFIG, {
                selectDestinationPath,
                parentDirPath,
                fileExists: false,
                parentDirExists: false,
            })
            expect(configFileLocation).toBe(selectDestinationPath)
            expect(existsSync(configFileLocation)).toBe(true)
        })

        it ('should throw when attempting to mkdir on existing path', async () => {
            const parentDirPath = '/home/'
            await expect(createStorageFile(CONFIG, {
                parentDirPath,
                parentDirExists: false,
            })).rejects.toThrow()
        })

        it ('should throw when no permissions on path', async () => {
            const parentDirPath = '/home/'
            const selectDestinationPath = parentDirPath + 'test-config.json'
            await expect(createStorageFile(CONFIG, {
                selectDestinationPath,
                parentDirPath,
                fileExists: false,
                parentDirExists: true,
            })).rejects.toThrow()
        })

    })

    describe('getEthereumConfigFromAnswers', () => {
        it ('should exercise the `generate` path', () => {
            const answers = {
                generateOrImportEthereumPrivateKey: 'Generate',
            }

            const ethereumPrivateKey = getPrivateKeyFromAnswers(answers)
            expect(ethereumPrivateKey).toBeDefined()
            expect(ethereumPrivateKey).toMatch(/^0x[0-9a-f]{64}$/)
        })

        it ('should exercise the `import` path', () => {
            const privateKey = Wallet.createRandom().privateKey
            const answers = {
                generateOrImportEthereumPrivateKey: 'Import',
                importPrivateKey: privateKey,
            }
            const ethereumPrivateKey = getPrivateKeyFromAnswers(answers)
            expect(ethereumPrivateKey).toBe(privateKey)
        })

        it ('should exercise the plugin port assignation path with a number', () => {
            assertValidPort(3737)
        })

        it ('should exercise the plugin port assignation path with a stringified number', () => {
            assertValidPort('3737')
        })
    })

    describe('end-to-end', () => {
        it ('should exercise the happy path with default answers', () => {
            const privateKeyAnswers = {
                generateOrImportEthereumPrivateKey: 'Generate',
                revealGeneratedPrivateKey: false
            }
            const pluginsAnswers = {
                selectPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: DEFAULT_CONFIG_PORTS.DEFAULT_WS_PORT,
                mqttPort: DEFAULT_CONFIG_PORTS.DEFAULT_MQTT_PORT,
                publishHttpPort: DEFAULT_CONFIG_PORTS.DEFAULT_HTTP_PORT,
            }
            const ethereumPrivateKey = getPrivateKeyFromAnswers(privateKeyAnswers)
            const config = getConfigFromAnswers(ethereumPrivateKey, pluginsAnswers)
            expect(config.plugins.websocket).toMatchObject({})
            expect(config.plugins.mqtt).toMatchObject({})
            expect(config.plugins.publishHttp).toMatchObject({})
            expect(config.ethereumPrivateKey).toMatch(/^0x[0-9a-f]{64}$/)
            expect(config.httpServer).toBe(undefined)
            expect(config.apiAuthentication).toBeDefined()
            expect(config.apiAuthentication.keys).toBeDefined()
            expect(config.apiAuthentication.keys.length).toBe(1)
            assertValidMisc(config)
        })

        it('should exercise the happy path with user input', () => {
            const privateKey = Wallet.createRandom().privateKey
            const privateKeyAnswers = {
                generateOrImportEthereumPrivateKey: 'Import',
                revealGeneratedPrivateKey: true,
                importPrivateKey: privateKey
            }
            const pluginsAnswers = {
                selectPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: '3170',
                mqttPort: '3171',
                publishHttpPort: '3172'
            }
            const ethereumPrivateKey = getPrivateKeyFromAnswers(privateKeyAnswers)
            const config = getConfigFromAnswers(ethereumPrivateKey, pluginsAnswers)
            expect(config.plugins.websocket.port).toBe(parseInt(pluginsAnswers.websocketPort))
            expect(config.plugins.mqtt.port).toBe(parseInt(pluginsAnswers.mqttPort))
            expect(config.httpServer.port).toBe(parseInt(pluginsAnswers.publishHttpPort))
            expect(config.plugins.publishHttp).toMatchObject({})
            expect(config.ethereumPrivateKey).toBe(privateKey)
            assertValidMisc(config)
        })
    })
})
