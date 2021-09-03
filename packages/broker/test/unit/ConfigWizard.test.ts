import { Wallet } from 'ethers'
import { writeFileSync, mkdtempSync, existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { PROMPTS, DEFAULT_CONFIG_PORTS, selectStoragePathPrompt, createStorageFile, getConfig, getPrivateKey, getNodeIdentity } from '../../src/ConfigWizard'

const assertValidPort = (port: number | string, pluginName = 'websocket') => {
    const numericPort = (typeof port === 'string') ? parseInt(port) : port
    const pluginsAnswers = {
        selectPlugins:[pluginName],
        websocketPort: port,
    }
    const config = getConfig(undefined as any, pluginsAnswers)
    expect(config.plugins[pluginName].port).toBe(numericPort)
}

describe('ConfigWizard', () => {
    const importPrivateKeyPrompt = PROMPTS.privateKey[1]
    const portPrompt = PROMPTS.plugins[1]

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
            const validate = selectStoragePathPrompt.validate!
            const validPath = tmpDataDir + '/test-config.json'
            expect(validate(validPath)).toBe(true)
        })

        it ('happy path with overwrite destination', () => {
            const validate = selectStoragePathPrompt.validate!
            const validPath = tmpDataDir + '/test-config.json'
            writeFileSync(validPath, JSON.stringify({}))
            const answers: any = {}
            const isValid = validate(validPath, answers)
            expect(isValid).toBe(true)
            expect(answers.parentDirExists).toBe(true)
            expect(answers.fileExists).toBe(true)
        })

        it ('invalid path provided', () => {
            const validate = selectStoragePathPrompt.validate!
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
            const selectStoragePath = parentDirPath + 'test-config.json'
            const configFileLocation: string = await createStorageFile(CONFIG, {
                selectStoragePath,
                parentDirPath,
                fileExists: false,
                parentDirExists: false,
            })
            expect(configFileLocation).toBe(selectStoragePath)
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
            const selectStoragePath = parentDirPath + 'test-config.json'
            await expect(createStorageFile(CONFIG, {
                selectStoragePath,
                parentDirPath,
                fileExists: false,
                parentDirExists: true,
            })).rejects.toThrow()
        })

    })

    describe('getPrivateKey and getConfig', () => {
        it ('should exercise the `generate` path', () => {
            const privateKey = getPrivateKey({})
            expect(privateKey).toBeDefined()
            expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/)
        })

        it ('should exercise the `import` path', () => {
            const importPrivateKey = Wallet.createRandom().privateKey
            const answers = {
                generateOrImportPrivateKey: 'Import',
                importPrivateKey
            }
            const privateKey = getPrivateKey(answers)
            expect(privateKey).toBe(privateKey)
        })

        it ('should exercise the plugin port assignation path with a number', () => {
            assertValidPort(3737)
        })

        it ('should exercise the plugin port assignation path with a stringified number', () => {
            assertValidPort('3737')
        })
    })

    describe('identity', () => {
        it ('happy path', () => {
            const privateKey = '0x9a2f3b058b9b457f9f954e62ea9fd2cefe2978736ffb3ef2c1782ccfad9c411d'
            const identity = getNodeIdentity(privateKey)
            expect(identity.mnemonic).toBe('Mountain Until Gun')
            expect(identity.networkExplorerUrl).toBe('https://streamr.network/network-explorer/nodes/0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc')
        })
    })

    describe('end-to-end', () => {
        it ('should exercise the happy path with default answers', () => {
            const privateKeyAnswers = {}
            const pluginsAnswers = {
                selectPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: DEFAULT_CONFIG_PORTS.WS,
                mqttPort: DEFAULT_CONFIG_PORTS.MQTT,
                publishHttpPort: DEFAULT_CONFIG_PORTS.HTTP,
            }
            const privateKey = getPrivateKey(privateKeyAnswers)
            const config = getConfig(privateKey, pluginsAnswers)
            expect(config.plugins.websocket).toMatchObject({})
            expect(config.plugins.mqtt).toMatchObject({})
            expect(config.plugins.publishHttp).toMatchObject({})
            expect(config.ethereumPrivateKey).toMatch(/^0x[0-9a-f]{64}$/)
            expect(config.httpServer).toBe(undefined)
            expect(config.apiAuthentication).toBeDefined()
            expect(config.apiAuthentication.keys).toBeDefined()
            expect(config.apiAuthentication.keys.length).toBe(1)
        })

        it('should exercise the happy path with user input', () => {
            const importPrivateKey = Wallet.createRandom().privateKey
            const privateKeyAnswers = {
                generateOrImportPrivateKey: 'Import',
                importPrivateKey
            }
            const pluginsAnswers = {
                selectPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: '3170',
                mqttPort: '3171',
                publishHttpPort: '3172'
            }
            const privateKey = getPrivateKey(privateKeyAnswers)
            const config = getConfig(privateKey, pluginsAnswers)
            expect(config.ethereumPrivateKey).toBe(importPrivateKey)
            expect(config.plugins.websocket.port).toBe(parseInt(pluginsAnswers.websocketPort))
            expect(config.plugins.mqtt.port).toBe(parseInt(pluginsAnswers.mqttPort))
            expect(config.httpServer.port).toBe(parseInt(pluginsAnswers.publishHttpPort))
            expect(config.plugins.publishHttp).toMatchObject({})
        })
    })
})
