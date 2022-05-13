import { cloneDeep, merge } from 'lodash'
import { validateConfig as validateClientConfig } from 'streamr-client'
import { createMigratedConfig, CURRENT_CONFIGURATION_VERSION, formSchemaUrl, needsMigration } from '../../src/config/migration'
import BROKER_CONFIG_SCHEMA from '../../src/config/config.schema.json'
import { validateConfig } from '../../src/config/validateConfig'
import { createPlugin } from '../../src/pluginRegistry'

const MOCK_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111'
const MOCK_API_KEY = 'mock-api-key'

const configWizardMinimal = {
    'network': {
        'name': 'miner-node',
        'trackers': [{
            'id': '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
            'ws': 'wss://testnet3.streamr.network:30401',
            'http': 'https://testnet3.streamr.network:30401'
        },
        {
            'id': '0x3D61bFeFA09CEAC1AFceAA50c7d79BE409E1ec24',
            'ws': 'wss://testnet3.streamr.network:30402',
            'http': 'https://testnet3.streamr.network:30402'
        },
        {
            'id': '0xE80FB5322231cBC1e761A0F896Da8E0CA2952A66',
            'ws': 'wss://testnet3.streamr.network:30403',
            'http': 'https://testnet3.streamr.network:30403'
        },
        {
            'id': '0xf626285C6AACDE39ae969B9Be90b1D9855F186e0',
            'ws': 'wss://testnet3.streamr.network:30404',
            'http': 'https://testnet3.streamr.network:30404'
        },
        {
            'id': '0xce88Da7FE0165C8b8586aA0c7C4B26d880068219',
            'ws': 'wss://testnet3.streamr.network:30405',
            'http': 'https://testnet3.streamr.network:30405'
        },
        {
            'id': '0x05e7a0A64f88F84fB1945a225eE48fFC2c48C38E',
            'ws': 'wss://testnet4.streamr.network:30401',
            'http': 'https://testnet4.streamr.network:30401'
        },
        {
            'id': '0xF15784106ACd35b0542309CDF2b35cb5BA642C4F',
            'ws': 'wss://testnet4.streamr.network:30402',
            'http': 'https://testnet4.streamr.network:30402'
        },
        {
            'id': '0x77FA7Af34108abdf8e92B8f4C4AeC7CbfD1d6B09',
            'ws': 'wss://testnet4.streamr.network:30403',
            'http': 'https://testnet4.streamr.network:30403'
        },
        {
            'id': '0x7E83e0bdAF1eF06F31A02f35A07aFB48179E536B',
            'ws': 'wss://testnet4.streamr.network:30404',
            'http': 'https://testnet4.streamr.network:30404'
        },
        {
            'id': '0x2EeF37180691c75858Bf1e781D13ae96943Dd388',
            'ws': 'wss://testnet4.streamr.network:30405',
            'http': 'https://testnet4.streamr.network:30405'
        }],
        'location': null,
        'stun': 'stun:stun.streamr.network:5349',
        'turn': null
    },
    'generateSessionId': false,
    'streamrUrl': 'https://streamr.network',
    'streamrAddress': '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
    'storageNodeConfig': {
        'registry': [{
            'address': '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916',
            'url': 'https://testnet2.streamr.network:8001'
        }]
    },
    'plugins': {
        'legacyWebsocket': {},
        'testnetMiner': {
            'rewardStreamIds': [
                'streamr.eth/brubeck-testnet/rewards/5hhb49',
                'streamr.eth/brubeck-testnet/rewards/95hc37',
                'streamr.eth/brubeck-testnet/rewards/12ab22',
                'streamr.eth/brubeck-testnet/rewards/z15g13',
                'streamr.eth/brubeck-testnet/rewards/111249',
                'streamr.eth/brubeck-testnet/rewards/0g2jha',
                'streamr.eth/brubeck-testnet/rewards/fijka2',
                'streamr.eth/brubeck-testnet/rewards/91ab49',
                'streamr.eth/brubeck-testnet/rewards/giab22',
                'streamr.eth/brubeck-testnet/rewards/25kpf4'
            ],
            'claimServerUrl': 'http://testnet1.streamr.network:3011',
            'stunServerHost': 'stun.sipgate.net'
        },
        'metrics': {
            'consoleAndPM2IntervalInSeconds': 0,
            'nodeMetrics': {
                'storageNode': '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916',
                'client': {
                    'wsUrl': 'ws://127.0.0.1:8082/api/v1/ws',
                    'httpUrl': 'https://streamr.network/api/v1'
                }
            }
        }
    },
    'apiAuthentication': {
        'keys': [
            MOCK_API_KEY
        ]
    },
    'ethereumPrivateKey': MOCK_PRIVATE_KEY
}

const configWizardFull = {
    ...cloneDeep(configWizardMinimal),
    plugins: {
        ...configWizardMinimal.plugins,
        'websocket': {
            'port': 1111
        },
        'mqtt': {
            'port': 2222
        },
        'publishHttp': {}
    },
    'httpServer': {
        'port': 3333
    }
}

const validateTargetConfig = async (config: any): Promise<void> | never => {
    validateConfig(config, BROKER_CONFIG_SCHEMA)
    validateClientConfig(config.client)
    for (const pluginName of Object.keys(config.plugins)) {
        const pluginConfig = config.plugins[pluginName]
        // validates the config against the schema
        await createPlugin(pluginName, {
            ...pluginConfig,
            name: pluginName,
            streamrClient: undefined,
            apiAuthenticator: undefined,
            brokerConfig: config
        })
    }
}

const testMigration = async (source: any, assertTarget: (target: any) => void | never) => {
    expect(needsMigration(source)).toBe(true)
    const target = createMigratedConfig(source)
    assertTarget(target)
    await validateTargetConfig(target)
}

describe('Config migration', () => {
    it('config wizard minimal', async () => {
        const source = configWizardMinimal
        await testMigration(source, (target) => {
            expect(target).toStrictEqual({
                $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION),
                client: {
                    auth: {
                        privateKey: MOCK_PRIVATE_KEY
                    }
                },
                apiAuthentication: {
                    keys: [MOCK_API_KEY]
                },
                plugins: {
                    brubeckMiner: {}
                },
            })
        })
    })

    it('config wizard full', async () => {
        const source = configWizardFull
        await testMigration(source, (target) => {
            expect(target).toStrictEqual({
                $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION),
                client: {
                    auth: {
                        privateKey: MOCK_PRIVATE_KEY
                    }
                },
                plugins: {
                    brubeckMiner: {},
                    websocket: {
                        port: 1111
                    },
                    mqtt: {
                        port: 2222
                    },
                    publishHttp: {}
                },
                httpServer: {
                    port: 3333
                },
                apiAuthentication: {
                    keys: [MOCK_API_KEY]
                }
            })    
        })
    })

    it('optional fields removed', async () => {
        const source = cloneDeep(configWizardMinimal) as any
        delete source.apiAuthentication
        delete source.httpServer
        await testMigration(source, (target: any) => {
            expect(target.apiAuthentication).toBeUndefined()
            expect(target.httpServer).toBeUndefined()
        })    
    })

    it('plugin port not defined', async () => {
        const source = cloneDeep(configWizardFull) as any
        delete source.plugins.websocket.port
        await testMigration(source, (target: any) => {
            expect(target.plugins.websocket.port).toBeUndefined()
        })  
    })

    it('manually configured values', async () => {
        const source = cloneDeep(configWizardMinimal) as any
        source.network.name = 'mock-name'
        source.network.location = {
            latitude: 12.34,
            longitude: 56.78,
            country: 'mock-country',
            city: null
        }
        source.plugins.metrics.consoleAndPM2IntervalInSeconds = 123
        await testMigration(source, (target: any) => {
            expect(target.client.network.name).toBeUndefined()
            expect(target.client.network.location).toStrictEqual({
                latitude: 12.34,
                longitude: 56.78,
                country: 'mock-country'
            })
            expect(target.plugins.consoleMetrics.interval).toBe(123)
        })
    })

    it('legacy plugin', async () => {
        const source = cloneDeep(configWizardMinimal) as any
        source.plugins.legacyMqtt = {}
        await testMigration(source, (target: any) => {
            expect(target.plugins.legacyMqtt).toBeUndefined()
        })  
    })

    it('storage plugin', async () => {
        const source = cloneDeep(configWizardMinimal) as any
        source.plugins.storage = {}
        return expect(async () => testMigration(source, () => {})).rejects.toThrow('Migration not supported for plugin: storage')
    })

    it('no migration', () => {
        const source = {
            $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION)
        }
        expect(needsMigration(source)).toBe(false)
    })

    it('corrupted config', () => {
        const source = {}
        expect(() => createMigratedConfig(source)).toThrow('Unable to migrate the config')
    })

    describe('from v1 to v2', () => {

        const createConfig = (version: number, customConfig: any) => {
            const minimalConfig = {
                $schema: `https://schema.streamr.network/config-v${version}.schema.json`,
                client: {
                    auth: {
                        privateKey: MOCK_PRIVATE_KEY
                    }
                },
                plugins: {}
            }
            const result = {}
            merge(result, minimalConfig, customConfig)
            return result
        }

        it('minimal', () => {
            const v1 = createConfig(1, {})
            const v2 = createConfig(2, {
                client: {
                    metrics: false
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v2)
        })

        it('metrics: default', () => {
            const v1 = createConfig(1, {
                plugins: {
                    metrics: {}
                }
            })
            const v2 = createConfig(2, {})
            expect(createMigratedConfig(v1)).toEqual(v2)
        })

        it('metrics: disabled', () => {
            const v1 = createConfig(1, {
                plugins: {
                    metrics: {
                        nodeMetrics: null
                    }
                }
            })
            const v2 = createConfig(2, {
                client: {
                    metrics: false
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v2)
        })

        it('metrics: custom stream', () => {
            const v1 = createConfig(1, {
                plugins: {
                    metrics: {
                        nodeMetrics: {
                            streamIdPrefix: 'mock-prefix'
                        }
                    }
                }
            })
            const v2 = createConfig(2, {
                client: {
                    metrics: {
                        periods: [
                            {
                                duration: 5000,
                                streamId: 'mock-prefix/sec'
                            },
                            {
                                duration: 60000,
                                streamId: 'mock-prefix/min'
                            },
                            {
                                duration: 3600000,
                                streamId: 'mock-prefix/hour'
                            },
                            {
                                duration: 86400000,
                                streamId: 'mock-prefix/day'
                            }
                        ]        
                    }
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v2)
        })

        it('unknown plugin', async () => {
            const v1 = createConfig(1, {
                plugins: {
                    foobar: {}
                }
            })
            return expect(async () => testMigration(v1, () => {})).rejects.toThrow('Unknown plugin: foobar')
        })

        it('invalid plugin config', async () => {
            const v1 = createConfig(1, {
                plugins: {
                    websocket: {
                        foobar: true
                    }
                }
            })
            return expect(async () => testMigration(v1, () => {})).rejects.toThrow('websocket plugin: must NOT have additional properties (foobar)')
        })
    })
})
