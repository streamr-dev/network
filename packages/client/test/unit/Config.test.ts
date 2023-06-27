import { createStrictConfig, JsonPeerDescriptor, redactConfig } from '../../src/Config'
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

        it('missing property', () => {
            expect(() => {
                return createStrictConfig({
                    network: {
                        layer0: {
                            entryPoints: [{
                                id: 'test'
                            }]
                        }
                    }
                } as any)
            }).toThrow("/network/layer0/entryPoints/0 must have required property 'type'")
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
                            layer0: {
                                webSocketPort: 'aaaa'
                            }
                        }
                    } as any)
                }).toThrow('/network/layer0/webSocketPort must be number')
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
            expect(clientOverrides.network.layer0!.entryPoints).not.toEqual(clientDefaults.network.layer0!.entryPoints)
            expect(clientOverrides.network.layer0!.entryPoints).toEqual(CONFIG_TEST.network!.layer0!.entryPoints)
        })

        it('network can be empty', () => {
            const clientDefaults = createStrictConfig()
            const clientOverrides = createStrictConfig({
                network: {}
            })
            expect(clientOverrides.network).toEqual(clientDefaults.network)
            expect(clientOverrides.network.layer0!.entryPoints![0].id).toEqual('productionEntryPoint1')
        })

        it('can override entryPoints', () => {
            const entryPoints = [{
                id: '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
                type: 0,
                websocket: {
                    ip: 'brubeck3.streamr.network',
                    port: 30401
                }
            }]
            const clientOverrides = createStrictConfig({
                network: {
                    layer0: {
                        entryPoints
                    }
                }
            })
            expect(clientOverrides.network.layer0!.entryPoints!).toEqual(entryPoints)
            expect(clientOverrides.network.layer0!.entryPoints!).not.toBe(entryPoints)
            expect((clientOverrides.network.layer0! as JsonPeerDescriptor[])[0]).not.toBe(entryPoints[0])
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
})
