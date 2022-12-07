import { TrackerRegistryRecord } from '@streamr/protocol'
import { omit } from 'lodash'
import { createStrictConfig, redactConfig, STREAM_CLIENT_DEFAULTS } from '../../src/Config'
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
                        trackers: [{
                            id: '0x1234567890123456789012345678901234567890',
                            ws: 'http://foo.bar'
                        }],
                        entryPoints: []
                    }
                } as any)
            }).toThrow('/network/trackers/0 must have required property \'http\'')
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
                            acceptProxyConnections: 123
                        }
                    } as any)
                }).toThrow('/network/acceptProxyConnections must be boolean')
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

        it('can override network.trackers arrays', () => {
            const clientDefaults = createStrictConfig()
            const clientOverrides = createStrictConfig(CONFIG_TEST)
            expect(clientOverrides.network.trackers).not.toEqual(clientDefaults.network.trackers)
            expect(clientOverrides.network.trackers).toEqual(CONFIG_TEST.network!.trackers)
        })

        it('network can be empty', () => {
            const clientDefaults = createStrictConfig()
            const clientOverrides = createStrictConfig({
                network: {}
            })
            expect(clientOverrides.network).toEqual(clientDefaults.network)
            expect(clientOverrides.network.trackers).toEqual({
                contractAddress: '0xab9BEb0e8B106078c953CcAB4D6bF9142BeF854d'
            })
        })

        it('can override trackers', () => {
            const trackers = [
                {
                    id: '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
                    ws: 'wss://brubeck3.streamr.network:30401',
                    http: 'https://brubeck3.streamr.network:30401'
                },
            ]
            const clientOverrides = createStrictConfig({
                network: {
                    trackers,
                }
            })
            expect(clientOverrides.network.trackers).toEqual(trackers)
            expect(clientOverrides.network.trackers).not.toBe(trackers)
            expect((clientOverrides.network.trackers as TrackerRegistryRecord[])[0]).not.toBe(trackers[0])
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

    it('defaults', () => {
        const config = createStrictConfig({})
        expect(omit(config, 'id')).toEqual(STREAM_CLIENT_DEFAULTS)
    })
})
