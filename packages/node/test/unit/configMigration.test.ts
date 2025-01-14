import merge from 'lodash/merge'
import {
    createMigratedConfig,
    CURRENT_CONFIGURATION_VERSION,
    formSchemaUrl,
    needsMigration
} from '../../src/config/migration'
import BROKER_CONFIG_SCHEMA from '../../src/config/config.schema.json'
import { validateConfig } from '../../src/config/validateConfig'
import { createPlugin } from '../../src/pluginRegistry'

const MOCK_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111'

const validateTargetConfig = async (config: any): Promise<void> | never => {
    validateConfig(config, BROKER_CONFIG_SCHEMA)
    for (const pluginName of Object.keys(config.plugins)) {
        // validates the config against the schema
        createPlugin(pluginName, config)
    }
}

const testMigration = async (source: any, assertTarget: (target: any) => void | never) => {
    expect(needsMigration(source)).toBe(true)
    const target = createMigratedConfig(source)
    assertTarget(target)
    await validateTargetConfig(target)
}

describe('Config migration', () => {
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

    describe('from v1 to v3', () => {
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
            const v3 = createConfig(3, {
                client: {
                    metrics: false
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v3)
            validateTargetConfig(v3)
        })

        it('null values', () => {
            const v1 = createConfig(1, {
                client: {},
                httpServer: {
                    port: 1111,
                    privateKeyFileName: null,
                    certFileName: null
                },
                apiAuthentication: null,
                plugins: {
                    mqtt: {
                        port: 2222,
                        streamIdDomain: null
                    },
                    storage: {
                        cassandra: {
                            hosts: ['mock-host'],
                            username: '',
                            password: '',
                            keyspace: '',
                            datacenter: ''
                        },
                        cluster: {
                            clusterAddress: null,
                            clusterSize: 123,
                            myIndexInCluster: 0
                        }
                    },
                    websocket: {
                        port: 3333,
                        sslCertificate: null
                    }
                }
            })
            const v3 = createConfig(3, {
                client: {
                    metrics: false
                },
                httpServer: {
                    port: 1111
                },
                plugins: {
                    mqtt: {
                        port: 2222
                    },
                    storage: {
                        cassandra: {
                            hosts: ['mock-host'],
                            username: '',
                            password: '',
                            keyspace: '',
                            datacenter: ''
                        },
                        cluster: {
                            clusterSize: 123,
                            myIndexInCluster: 0
                        }
                    },
                    websocket: {
                        port: 3333
                    }
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v3)
            validateTargetConfig(v3)
        })

        it('ssl certificate', () => {
            const v1 = createConfig(1, {
                httpServer: {
                    port: 1234,
                    certFileName: 'mock-cert',
                    privateKeyFileName: 'mock-private-key'
                }
            })
            const v3 = createConfig(3, {
                client: {
                    metrics: false
                },
                httpServer: {
                    port: 1234,
                    sslCertificate: {
                        certFileName: 'mock-cert',
                        privateKeyFileName: 'mock-private-key'
                    }
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v3)
            validateTargetConfig(v3)
        })

        it('metrics: default', () => {
            const v1 = createConfig(1, {
                plugins: {
                    metrics: {}
                }
            })
            const v3 = createConfig(3, {})
            expect(createMigratedConfig(v1)).toEqual(v3)
        })

        it('metrics: disabled', () => {
            const v1 = createConfig(1, {
                plugins: {
                    metrics: {
                        nodeMetrics: null
                    }
                }
            })
            const v3 = createConfig(3, {
                client: {
                    metrics: false
                }
            })
            expect(createMigratedConfig(v1)).toEqual(v3)
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
            const v3 = createConfig(3, {
                client: {
                    metrics: {
                        periods: [
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
            expect(createMigratedConfig(v1)).toEqual(v3)
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
            return expect(async () => testMigration(v1, () => {})).rejects.toThrow(
                'websocket plugin: must NOT have additional properties (foobar)'
            )
        })
    })
})
