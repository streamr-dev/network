import { NetworkNodeType } from '@streamr/sdk'
import { overrideConfigToEnvVarsIfGiven } from '../../src/config/config'

describe('overrideConfigToEnvVarsIfGiven', () => {

    beforeEach(() => {
        const PREFIX = 'STREAMR__BROKER__'
        Object.keys(process.env).forEach((variableName: string) => {
            if (variableName.startsWith(PREFIX)) {
                delete process.env[variableName]
            }
        })
    })

    it('happy path', () => {
        const config = {
            client: {
                auth: {
                    privateKey: 'will-be-overridden'
                }
            },
            plugins: {
                info: {}
            }
        }
        process.env.STREAMR__BROKER__CLIENT__AUTH__PRIVATE_KEY = '0x111'
        process.env.STREAMR__BROKER__CLIENT__ORDER_MESSAGES = 'true'
        process.env.STREAMR__BROKER__CLIENT__GAP_FILL = 'false'
        process.env.STREAMR__BROKER__CLIENT__NETWORK__CONTROL_LAYER__PEER_DESCRIPTOR__NODE_ID = 'nodeId'
        process.env.STREAMR__BROKER__CLIENT__NETWORK__CONTROL_LAYER__PEER_DESCRIPTOR__TYPE = NetworkNodeType.NODEJS
        process.env.STREAMR__BROKER__AUTHENTICATION__KEYS_1 = 'key-1'
        process.env.STREAMR__BROKER__AUTHENTICATION__KEYS_2 = 'key-2'
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({
            client: {
                auth: {
                    privateKey: '0x111'
                },
                orderMessages: true,
                gapFill: false,
                network: {
                    controlLayer: {
                        peerDescriptor: {
                            nodeId: 'nodeId',
                            type: NetworkNodeType.NODEJS
                        }
                    }
                }
            },
            authentication: {
                keys: ['key-1', 'key-2']
            },
            plugins: {
                info: {}
            }
        })
    })

    it('empty variable', () => {
        process.env.STREAMR__BROKER__CLIENT__AUTH__PRIVATE_KEY = ''
        const config = {} as any
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({})
    })

    it('malformed variable', () => {
        expect(() => {
            process.env.STREAMR__BROKER__AUTHENTICATION__KEYS1 = 'key-1'
            overrideConfigToEnvVarsIfGiven({} as any)
        }).toThrow('STREAMR__BROKER__AUTHENTICATION__KEYS1')
    })

    it('plugins configuration', () => {
        const config = {
            plugins: {
                mqtt: {}
            }
        }
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT = '25'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT = '1000'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_ACCEPTABLE_MIN_OPERATOR_COUNT = '50'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS = '3600000'
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({
            plugins: {
                mqtt: {},
                autostaker: {
                    operatorContractAddress: '0x1234567890abcdef1234567890abcdef12345678',
                    maxSponsorshipCount: 25,
                    minTransactionDataTokenAmount: 1000,
                    maxAcceptableMinOperatorCount: 50,
                    runIntervalInMs: 3600000
                }
            }
        })
    })

    it('plugins configuration with nested objects', () => {
        const config = {
            plugins: {}
        }
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS = '10000'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_AGE_IN_MS = '180000'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_INTERVAL_IN_MS = '30000'
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({
            plugins: {
                autostaker: {
                    operatorContractAddress: '0x1234567890abcdef1234567890abcdef12345678',
                    fleetState: {
                        heartbeatUpdateIntervalInMs: 10000,
                        pruneAgeInMs: 180000,
                        pruneIntervalInMs: 30000
                    }
                }
            }
        })
    })

    it('plugins configuration overrides existing values', () => {
        const config = {
            plugins: {
                autostaker: {
                    operatorContractAddress: '0xold',
                    maxSponsorshipCount: 10
                }
            }
        }
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS = '0xnew'
        process.env.STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT = '25'
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({
            plugins: {
                autostaker: {
                    operatorContractAddress: '0xnew',
                    maxSponsorshipCount: 25
                }
            }
        })
    })
})
