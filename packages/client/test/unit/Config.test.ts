import { config as CHAIN_CONFIG } from '@streamr/config'
import omit from 'lodash/omit'
import { NetworkNodeType, NetworkPeerDescriptor, createStrictConfig, redactConfig } from '../../src/Config'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { generateEthereumAccount } from '../../src/Ethereum'
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
                        mainChainRPCs: {
                            chainId: 123,
                            rpcs: []
                        }
                    }
                } as any)
            }).toThrow('/contracts/mainChainRPCs/rpcs must NOT have fewer than 1 items')
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
            const clientOverrides = createStrictConfig(CONFIG_TEST)
            expect(clientOverrides.network.controlLayer.entryPoints).not.toEqual(clientDefaults.network.controlLayer.entryPoints)
            expect(clientOverrides.network.controlLayer.entryPoints).toEqual(CHAIN_CONFIG.dev2.entryPoints.map((entryPoint) => ({
                ...omit(entryPoint, 'id'),
                nodeId: entryPoint.id 
            })))
        })

        it('network can be empty', () => {
            const clientDefaults = createStrictConfig()
            const clientOverrides = createStrictConfig({
                network: {}
            })
            expect(clientOverrides.network).toEqual(clientDefaults.network)
            expect(clientOverrides.network.controlLayer.entryPoints![0].nodeId).toEqual('eee1')
        })

        it('can override entryPoints', () => {
            const entryPoints = [{
                nodeId: '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
                type: NetworkNodeType.NODEJS,
                websocket: {
                    host: 'brubeck3.streamr.network',
                    port: 30401,
                    tls: false
                }
            }]
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

    describe('preset', () => {

        it('happy path', () => {
            const presetId = 'mumbai'  // some preset id
            const config: any = {
                config: presetId
            }
            expect(createStrictConfig(config)).toMatchObject({
                network: {
                    controlLayer: {
                        entryPoints: CHAIN_CONFIG[presetId].entryPoints.map((entryPoint) => ({
                            ...omit(entryPoint, 'id'),
                            nodeId: entryPoint.id 
                        }))
                    }
                },
                contracts: {
                    streamRegistryChainAddress: CHAIN_CONFIG[presetId].contracts.StreamRegistry,
                    streamStorageRegistryChainAddress: CHAIN_CONFIG[presetId].contracts.StreamStorageRegistry,
                    storageNodeRegistryChainAddress: CHAIN_CONFIG[presetId].contracts.StorageNodeRegistry,
                    mainChainRPCs: {
                        name: CHAIN_CONFIG[presetId].name,
                        chainId: CHAIN_CONFIG[presetId].id,
                        rpcs: CHAIN_CONFIG[presetId].rpcEndpoints
                    },
                    streamRegistryChainRPCs: {
                        name: CHAIN_CONFIG[presetId].name,
                        chainId: CHAIN_CONFIG[presetId].id,
                        rpcs: CHAIN_CONFIG[presetId].rpcEndpoints
                    },
                    theGraphUrl: CHAIN_CONFIG[presetId].theGraphUrl
                }
            })
        })

        it('override', () => {
            const presetId = 'mumbai'  // some preset id
            const config: any = {
                config: presetId,
                contracts: {
                    streamStorageRegistryChainAddress: '0x1234567890123456789012345678901234567890'
                }
            }
            expect(createStrictConfig(config)).toMatchObject({
                contracts: {
                    streamRegistryChainAddress: CHAIN_CONFIG[presetId].contracts.StreamRegistry,
                    streamStorageRegistryChainAddress: '0x1234567890123456789012345678901234567890',
                    storageNodeRegistryChainAddress: CHAIN_CONFIG[presetId].contracts.StorageNodeRegistry
                }
            })
        })
    })
})
