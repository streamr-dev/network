import { overrideConfigToEnvVarsIfGiven } from '../../src/config/config'

describe('overrideConfigToEnvVarsIfGiven', () => {
    it('environment variable OVERRIDE_BROKER_PRIVATE_KEY overrides config (NET-934)', async () => {
        const PK = '0x222'
        const config = {
            client: {
                auth: {
                    privateKey: '0x111'
                }
            },
            plugins: {}
        }
        process.env.OVERRIDE_BROKER_PRIVATE_KEY = PK
        await overrideConfigToEnvVarsIfGiven(config)
        expect(config.client.auth.privateKey).toEqual(PK)
    })

    it('environment variable OVERRIDE_BROKER_BENEFICIARY_ADDRESS overrides config (NET-934)', async () => {
        const BENEFICIARY_ADDRESS = '0x1957abc2e960eb5f2c6a166e7a628ded7570e298'
        const config = {
            client: {
                auth: {
                    privateKey: '0x111'
                }
            },
            plugins: {
                brubeckMiner: {}
            }
        }
        process.env.OVERRIDE_BROKER_BENEFICIARY_ADDRESS = BENEFICIARY_ADDRESS
        await overrideConfigToEnvVarsIfGiven(config)
        expect((config.plugins.brubeckMiner as any).beneficiaryAddress).toEqual(BENEFICIARY_ADDRESS)
    })
})
