import { Wallet } from 'ethers'
import { mkdtempSync, existsSync } from 'fs'
import os from 'os'
import path from 'path'
import {
    PROMPTS,
    DEFAULT_CONFIG_PORTS,
    createStorageFile,
    getConfig,
    getPrivateKey,
    getNodeIdentity,
    start,
    PluginAnswers,
    PrivateKeyAnswers,
    StorageAnswers
} from '../../src/config/ConfigWizard'
import { readFileSync } from 'fs'
import { createBroker } from '../../src/broker'

const MOCK_PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234'

const createMockLogger = () => {
    const messages: string[] = []
    return {
        info: (message: string) => messages.push(message),
        warn: console.warn,
        error: console.error,
        messages
    }
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
            expect(validate(privateKey)).toBe(`Invalid private key provided.`)
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

    describe('createStorageFile', () => {
        const CONFIG: any = {}
        let tmpDataDir: string

        beforeAll(() => {
            tmpDataDir = mkdtempSync(path.join(os.tmpdir(), 'broker-test-config-wizard'))
        })

        it ('happy path; create directories if needed', async () => {
            const dirPath = tmpDataDir + '/newdir1/newdir2/'
            const configPath = dirPath + 'test-config.json'
            const configFileLocation: string = await createStorageFile(CONFIG, {
                storagePath: configPath
            })
            expect(configFileLocation).toBe(configPath)
            expect(existsSync(configFileLocation)).toBe(true)
        })

        it ('should throw when no permissions on path', async () => {
            const dirPath = '/home/'
            const configPath = dirPath + 'test-config.json'
            await expect(createStorageFile(CONFIG, {
                storagePath: configPath
            })).rejects.toThrow()
        })

    })

    describe('getPrivateKey', () => {
        it ('should exercise the `generate` path', () => {
            const privateKey = getPrivateKey({
                generateOrImportPrivateKey: 'Generate'
            })
            expect(privateKey).toBeDefined()
            expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/)
        })

        it ('should exercise the `import` path', () => {
            const importPrivateKey = Wallet.createRandom().privateKey
            const answers: PrivateKeyAnswers = {
                generateOrImportPrivateKey: 'Import',
                importPrivateKey
            }
            const privateKey = getPrivateKey(answers)
            expect(privateKey).toBe(privateKey)
        })

    })

    describe('getConfig', () => {
        const assertValidPort = (port: number | string, pluginName = 'websocket') => {
            const numericPort = (typeof port === 'string') ? parseInt(port) : port
            const pluginsAnswers: PluginAnswers = {
                enabledApiPlugins: [pluginName],
                websocketPort: String(port),
                enableMinerPlugin: true
            }
            const config = getConfig(MOCK_PRIVATE_KEY, pluginsAnswers)
            expect(config.plugins[pluginName].port).toBe(numericPort)
        }

        it ('should exercise the plugin port assignation path with a number', () => {
            assertValidPort(3737)
        })

        it ('should exercise the plugin port assignation path with a stringified number', () => {
            assertValidPort('3737')
        })

        it ('should exercise the happy path with default answers', () => {
            const pluginsAnswers: PluginAnswers = {
                enabledApiPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: String(DEFAULT_CONFIG_PORTS.WS),
                mqttPort: String(DEFAULT_CONFIG_PORTS.MQTT),
                publishHttpPort: String(DEFAULT_CONFIG_PORTS.HTTP),
                enableMinerPlugin: true,
            }
            const config = getConfig(MOCK_PRIVATE_KEY, pluginsAnswers)
            expect(config.plugins.websocket).toMatchObject({})
            expect(config.plugins.mqtt).toMatchObject({})
            expect(config.plugins.publishHttp).toMatchObject({})
            expect(config.httpServer).toBe(undefined)
            expect(config.plugins.brubeckMiner).toEqual({})
        })

        it('should exercise the happy path with user-provided data', () => {
            const pluginsAnswers: PluginAnswers = {
                enabledApiPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: '3170',
                mqttPort: '3171',
                publishHttpPort: '3172',
                enableMinerPlugin: true
            }
            const config = getConfig(MOCK_PRIVATE_KEY, pluginsAnswers)
            expect(config.plugins.websocket.port).toBe(parseInt(pluginsAnswers.websocketPort!))
            expect(config.plugins.mqtt.port).toBe(parseInt(pluginsAnswers.mqttPort!))
            expect(config.httpServer.port).toBe(parseInt(pluginsAnswers.publishHttpPort!))
            expect(config.plugins.publishHttp).toMatchObject({})
            expect(config.plugins.brubeckMiner).toEqual({})
        })

        it('disable miner plugin', () => {
            const pluginsAnswers: PluginAnswers = {
                enabledApiPlugins: [],
                enableMinerPlugin: false,
            }
            const config = getConfig(MOCK_PRIVATE_KEY, pluginsAnswers)
            expect(config.plugins.brubeckMiner).toBeUndefined()
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

    describe('user flow', () => {
        it ('should exercise the happy path', async () => {
            const tmpDataDir = mkdtempSync(path.join(os.tmpdir(), 'broker-test-config-wizard'))
            const privateKeyAnswers: PrivateKeyAnswers = {
                generateOrImportPrivateKey: 'Import',
                importPrivateKey: '0x1234567890123456789012345678901234567890123456789012345678901234'
            }
            const pluginAnswers: PluginAnswers = {
                enabledApiPlugins: [ 'websocket', 'mqtt', 'publishHttp' ],
                websocketPort: '3170',
                mqttPort: '3171',
                publishHttpPort: '3172',
                enableMinerPlugin: true
            }
            const storageAnswers: StorageAnswers = {
                storagePath: tmpDataDir + 'test-config.json'
            }
            const logger = createMockLogger()
            await start(
                jest.fn().mockResolvedValue(privateKeyAnswers),
                jest.fn().mockResolvedValue(pluginAnswers),
                jest.fn().mockResolvedValue(storageAnswers),
                logger
            )
            expect(logger.messages).toEqual([
                'Welcome to the Streamr Network',
                'Your node\'s generated name is Company Session Mix.',
                'View your node in the Network Explorer:',
                'https://streamr.network/network-explorer/nodes/0x2e988A386a799F506693793c6A5AF6B54dfAaBfB',
                'You can start the broker now with',
                `streamr-broker ${storageAnswers.storagePath}`,
            ])
            const fileContent = readFileSync(storageAnswers.storagePath).toString()
            const config = JSON.parse(fileContent)
            expect(config.client.auth.privateKey).toBe(privateKeyAnswers.importPrivateKey)
            expect(config.plugins.websocket.port).toBe(parseInt(pluginAnswers.websocketPort!))
            expect(config.plugins.mqtt.port).toBe(parseInt(pluginAnswers.mqttPort!))
            expect(config.plugins.brubeckMiner).toEqual({})
            expect(config.httpServer.port).toBe(parseInt(pluginAnswers.publishHttpPort!))
            expect(config.plugins.publishHttp).toMatchObject({})
            expect(config.apiAuthentication).toBeDefined()
            expect(config.apiAuthentication.keys).toBeDefined()
            expect(config.apiAuthentication.keys.length).toBe(1)
            return expect(createBroker(config)).resolves.toBeDefined()
        })
    })
})
