import { Wallet } from 'ethers'
import { writeFileSync, mkdtempSync } from 'fs'
import os from 'os'
import path from 'path'
import { basicPrompts, getConfigFromAnswers, pluginPrompts, StorageAnswersPrompt } from '../../src/ConfigWizard'

describe('ConfigWizard:validation', () => {
    let tmpDataDir: string

    beforeAll(() => {
        tmpDataDir = mkdtempSync(path.join(os.tmpdir(), 'broker-test-config-wizard'))
    })

    it ('should exercise the `validate` method from the importPrivateKey basicPrompt', async () => {
        const validate = basicPrompts[1].validate!
        const privateKey = Wallet.createRandom().privateKey
        expect(validate(privateKey)).toBe(true)
    })

    it ('should fail  `validate` method from the importPrivateKey basicPrompt when an invalid private key is provided', async () => {
        const validate = basicPrompts[1].validate!
        const privateKey = '0xInvalidPrivateKey'
        expect(validate(privateKey)).toBe(`Invalid privateKey provided for import: ${privateKey}`)
    })

    it ('should exercise the `validate` method from the plugin prompts', async () => {
        const validate = pluginPrompts[0].validate!
        expect(validate('7070')).toBe(true)
    })

    it ('should fail when running `validate` with an out of range number (portNumber < 1024 || portNumber > 49151)', async () => {
        const validate = pluginPrompts[0].validate!
        const port = '10000000000'
        expect(validate(port)).toBe(`Out of range port ${port} provided (valid range 1024-49151)`)
    })

    it ('should fail to `validate` when given a non-numeric port', async () => {
        const validate = pluginPrompts[0].validate!
        const port = 'Not A Number!'
        expect(validate(port)).toBe(`Non-numeric value ${port} provided`)
    })

    it ('should exercise the `validate` method from the destination path prompt', async () => {
        const validate = StorageAnswersPrompt.validate!
        const validPath = tmpDataDir + '/test-config.json'
        expect(validate(validPath)).toBe(true)
    })

    it ('should fail to `validate` the destination path prompt when the file already exists', async() => {
        const validate = StorageAnswersPrompt.validate!
        const validPath = tmpDataDir + '/test-config.json'
        writeFileSync(validPath, JSON.stringify({}))
        const answers: any = {}
        const isValid = validate(validPath, answers)
        expect(isValid).toBe(true)
        expect(answers.clearPath).toBe(false)
    })
})

describe('ConfigWizard:flow', () => {
    it('should exercise the happy path for the answers to config flow', async () => {
        const answers = {
            plugins: {
                websocket: { port: 7170 },
                mqtt: { port: 7171, payloadMetadata: false, sslCertificate: null },
                legacyPublishHttp: { port: 7172 }
            },
            ethereumPrivateKey: '0x8bf21d11985f71f0584159f667e4131a0f7020f5e638959d3f230ec2ba7886d1',
        }
        const config = getConfigFromAnswers(answers)
        expect(config.plugins.websocket.port).toBe(answers.plugins.websocket.port)
        expect(config.plugins.mqtt.port).toBe(answers.plugins.mqtt.port)
        expect(config.plugins.legacyPublishHttp.port).toBe(answers.plugins.legacyPublishHttp.port)
        expect(config.ethereumPrivateKey).toBe(answers.ethereumPrivateKey)
    })
})