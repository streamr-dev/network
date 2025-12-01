import fs from 'fs'
import path from 'path'
import { createBroker } from '../../src/broker'
import { overrideConfigToEnvVarsIfGiven } from '../../src/config/config'

const PATH = './configs'

describe('Config', () => {

    it('start with minimal config', async () => {
        const broker = await createBroker({
            client: {
                environment: 'dev2',
                network: {
                    controlLayer: {
                        websocketServerEnableTls: false
                    }
                }
            }
        })
        await broker.start()
        await broker.stop()
    })

    it('temporary compatibility', async () => {
        const broker = await createBroker({
            client: {
                environment: 'dev2',
                network: {
                    controlLayer: {
                        entryPoints: [{
                            id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                            websocket: {
                                'host': '10.200.10.1',
                                'port': 40500,
                                'tls': false
                            }
                        }],
                        websocketServerEnableTls: false
                    }
                }
            }
        } as any)
        await broker.start()
        await broker.stop()
    })

    it('configure plugin via environment variables', async () => {
        // Set up environment variables for autostaker plugin
        const originalEnv = { ...process.env }
        try {
            process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
            process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT = '30'
            process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT = '2000'
            process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS = '300000'

            const config: any = {
                client: {
                    environment: 'dev2',
                    network: {
                        controlLayer: {
                            websocketServerEnableTls: false
                        }
                    }
                },
                plugins: {}
            }

            // Apply environment variable overrides
            overrideConfigToEnvVarsIfGiven(config)

            // Verify that the environment variables were properly applied
            expect(config.plugins.autostaker).toBeDefined()
            expect(config.plugins.autostaker.operatorContractAddress).toBe('0x1234567890abcdef1234567890abcdef12345678')
            expect(config.plugins.autostaker.maxSponsorshipCount).toBe(30)
            expect(config.plugins.autostaker.minTransactionDataTokenAmount).toBe(2000)
            expect(config.plugins.autostaker.runIntervalInMs).toBe(300000)

            // Verify that the broker can be created with this configuration
            const broker = await createBroker(config)
            await broker.start()
            await broker.stop()
        } finally {
            // Clean up environment variables
            Object.keys(process.env).forEach((key) => {
                if (key.startsWith('STREAMR__BROKER__PLUGINS__')) {
                    delete process.env[key]
                }
            })
            // Restore original environment
            process.env = originalEnv
        }
    })

    const fileNames = fs.readdirSync(PATH)

    describe.each(fileNames.map((fileName) => [fileName]))('validate', (fileName: string) => {

        it(fileName, () => {
            const filePath = PATH + path.sep + fileName
            const content = fs.readFileSync(filePath)
            const config = JSON.parse(content.toString())
            return expect(createBroker(config)).resolves.toBeDefined()
        })

    })
})
