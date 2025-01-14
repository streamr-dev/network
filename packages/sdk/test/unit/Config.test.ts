import { config as CHAIN_CONFIG } from '@streamr/config'
import { cloneDeep } from 'lodash'
import {
    DEFAULT_ENVIRONMENT_ID,
    NetworkNodeType,
    NetworkPeerDescriptor,
    createStrictConfig,
    redactConfig
} from '../../src/Config'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { generateEthereumAccount } from '../../src/ethereumUtils'
import { StreamrClient } from '../../src/StreamrClient'

describe('Config', () => {
    describe('validate', () => {
        it('additional property', () => {
            expect(() => {
                return createStrictConfig({
                    network: {
                        foo: 'bar'
                    }
                } as any)
            }).toThrow('/network must NOT have additional properties: foo')
        })

        it('empty array', () => {
            expect(() => {
                return createStrictConfig({
                    contracts: {
                        rpcs: []
                    }
                } as any)
            }).toThrow('/contracts/rpcs must NOT have fewer than 1 items')
        })

        describe('invalid property format', () => {
            it('primitive', () => {
                expect(() => {
                    return createStrictConfig({
                        network: {
                            controlLayer: {
                                websocketPortRange: {
                                    min: 'aaa',
                                    max: 1111
                                }
                            }
                        }
                    } as any)
                }).toThrow('/network/controlLayer/websocketPortRange/min must be number')
            })

            it('ajv-format', () => {
                expect(() => {
                    return createStrictConfig({
                        contracts: {
                            theGraphUrl: 'foo'
                        }
                    } as any)
                }).toThrow('/contracts/theGraphUrl must match format "uri"')
            })

            it('ethereum address', () => {
                expect(() => {
                    return createStrictConfig({
                        auth: {
                            address: 'foo'
                        }
                    } as any)
                }).toThrow('/auth/address must match format "ethereum-address"')
            })

            it('ethereum private key', () => {
                expect(() => {
                    return createStrictConfig({
                        auth: {
                            privateKey: 'foo'
                        }
                    } as any)
                }).toThrow('/auth/privateKey must match format "ethereum-private-key"')
            })
        })
    })

    describe('ignorable properties', () => {
        it('auth address', () => {
            expect(() => {
                const wallet = generateEthereumAccount()
                return new StreamrClient({ auth: wallet })
            }).not.toThrow()
        })
    })

    describe('merging configs', () => {
        it('works with no arguments', () => {
            expect(new StreamrClient()).toBeInstanceOf(StreamrClient)
        })

        it('can override network.entryPoints arrays', () => {
            const clientDefaults = createStrictConfig()
            const clientOverrides = createStrictConfig({ environment: 'dev2' })
            expect(clientOverrides.network.controlLayer.entryPoints).not.toEqual(
                clientDefaults.network.controlLayer.entryPoints
            )
            expect(clientOverrides.network.controlLayer.entryPoints).toEqual(CHAIN_CONFIG.dev2.entryPoints)
        })

        it('network can be empty', () => {
            const clientDefaults = createStrictConfig()
            const clientOverrides = createStrictConfig({
                network: {}
            })
            expect(clientOverrides.network).toEqual(clientDefaults.network)
            expect(clientOverrides.network.controlLayer.entryPoints![0].nodeId).toEqual(
                CHAIN_CONFIG[DEFAULT_ENVIRONMENT_ID].entryPoints[0].nodeId
            )
        })

        it('can override entryPoints', () => {
            const entryPoints = [
                {
                    nodeId: '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
                    type: NetworkNodeType.NODEJS,
                    websocket: {
                        host: 'brubeck3.streamr.network',
                        port: 30401,
                        tls: false
                    }
                }
            ]
            const clientOverrides = createStrictConfig({
                network: {
                    controlLayer: {
                        entryPoints
                    }
                }
            })
            expect(clientOverrides.network.controlLayer.entryPoints!).toEqual(entryPoints)
            expect(clientOverrides.network.controlLayer.entryPoints!).not.toBe(entryPoints)
            expect((clientOverrides.network.controlLayer as NetworkPeerDescriptor[])[0]).not.toBe(entryPoints[0])
        })
    })

    it('redact', () => {
        const config: any = {
            auth: {
                privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001'
            }
        }
        redactConfig(config)
        expect(config.auth.privateKey).toBe('(redacted)')
    })

    describe('environment defaults', () => {
        it('happy path', () => {
            const environmentId = 'polygonAmoy' // some environment id
            const config: any = {
                environment: environmentId
            }
            expect(createStrictConfig(config)).toMatchObject({
                network: {
                    controlLayer: {
                        entryPoints: CHAIN_CONFIG[environmentId].entryPoints
                    }
                },
                contracts: {
                    ethereumNetwork: {
                        chainId: CHAIN_CONFIG[environmentId].id
                    },
                    streamRegistryChainAddress: CHAIN_CONFIG[environmentId].contracts.StreamRegistry,
                    streamStorageRegistryChainAddress: CHAIN_CONFIG[environmentId].contracts.StreamStorageRegistry,
                    storageNodeRegistryChainAddress: CHAIN_CONFIG[environmentId].contracts.StorageNodeRegistry,
                    rpcs: CHAIN_CONFIG[environmentId].rpcEndpoints,
                    theGraphUrl: CHAIN_CONFIG[environmentId].theGraphUrl
                }
            })
        })

        it('override', () => {
            const environmentId = 'polygonAmoy' // some environment id
            const config: any = {
                environment: environmentId,
                contracts: {
                    streamStorageRegistryChainAddress: '0x1234567890123456789012345678901234567890'
                }
            }
            expect(createStrictConfig(config)).toMatchObject({
                contracts: {
                    streamRegistryChainAddress: CHAIN_CONFIG[environmentId].contracts.StreamRegistry,
                    streamStorageRegistryChainAddress: '0x1234567890123456789012345678901234567890',
                    storageNodeRegistryChainAddress: CHAIN_CONFIG[environmentId].contracts.StorageNodeRegistry
                }
            })
        })

        it('dev2 injects CONFIG_TEST values', () => {
            const config: any = {
                environment: 'dev2',
                network: {
                    controlLayer: {
                        maxMessageSize: 123
                    }
                }
            }
            const expected = cloneDeep(CONFIG_TEST)
            expected.network!.controlLayer!.maxMessageSize = 123
            expect(createStrictConfig(config)).toMatchObject(expected)
        })

        describe('highGasPrice', () => {
            it('without ethereum network config', () => {
                const config: any = {
                    environment: 'polygon'
                }
                expect(createStrictConfig(config)).toMatchObject({
                    contracts: {
                        ethereumNetwork: {
                            highGasPriceStrategy: true
                        }
                    }
                })
            })

            it('with ethereum network config', () => {
                const config: any = {
                    environment: 'polygon',
                    contracts: {
                        ethereumNetwork: {
                            overrides: {
                                gasLimit: 123
                            }
                        }
                    }
                }
                expect(createStrictConfig(config)).toMatchObject({
                    contracts: {
                        ethereumNetwork: {
                            highGasPriceStrategy: true,
                            overrides: {
                                gasLimit: 123
                            }
                        }
                    }
                })
            })

            it('explicit config value is not overriden', () => {
                const config: any = {
                    environment: 'polygon',
                    contracts: {
                        ethereumNetwork: {
                            highGasPriceStrategy: false
                        }
                    }
                }
                expect(createStrictConfig(config)).toMatchObject({
                    contracts: {
                        ethereumNetwork: {
                            highGasPriceStrategy: false
                        }
                    }
                })
            })
        })
    })
})
