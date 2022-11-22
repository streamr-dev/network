import { TrackerRegistryRecord } from '@streamr/protocol'
import { fastPrivateKey } from '@streamr/test-utils'
import { createStrictConfig, STREAM_CLIENT_DEFAULTS } from '../../src/Config'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { generateEthereumAccount } from '../../src/Ethereum'
import { STREAMR_ICE_SERVERS } from '@streamr/network-node'
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
                        }]
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

    it('uses PRODUCTION_STUN_URLS by default', () => {
        const clientDefaults = createStrictConfig()
        expect(clientDefaults.network.iceServers).toEqual(STREAMR_ICE_SERVERS)
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
            expect(clientOverrides.network.trackers).toEqual(STREAM_CLIENT_DEFAULTS.network.trackers)
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

        describe('metrics', () => {
            describe('default', () => {
                it('private key auth', () => {
                    const config = createStrictConfig({
                        auth: {
                            privateKey: fastPrivateKey()
                        }
                    })
                    expect(config.metrics.periods).toEqual(STREAM_CLIENT_DEFAULTS.metrics.periods)
                    expect(config.metrics.maxPublishDelay).toEqual(STREAM_CLIENT_DEFAULTS.metrics.maxPublishDelay)
                })
                it('ethereum auth', () => {
                    const config = createStrictConfig({
                        auth: {
                            ethereum: {}
                        }
                    })
                    expect(config.metrics.periods).toEqual([])
                    expect(config.metrics.maxPublishDelay).toEqual(STREAM_CLIENT_DEFAULTS.metrics.maxPublishDelay)
                })
                it('unauthenticated', () => {
                    const config = createStrictConfig({})
                    expect(config.metrics.periods).toEqual(STREAM_CLIENT_DEFAULTS.metrics.periods)
                    expect(config.metrics.maxPublishDelay).toEqual(STREAM_CLIENT_DEFAULTS.metrics.maxPublishDelay)
                })
            })
            it('periods overrided', () => {
                const config = createStrictConfig({
                    metrics: {
                        periods: [{ duration: 10, streamId: 'foo' }]
                    }
                })
                expect(config.metrics.periods).toEqual([{ duration: 10, streamId: 'foo' }])
                expect(config.metrics.maxPublishDelay).toEqual(STREAM_CLIENT_DEFAULTS.metrics.maxPublishDelay)
            })
            it('maxPublishDelay overrided', () => {
                const config = createStrictConfig({
                    metrics: {
                        maxPublishDelay: 123
                    }
                })
                expect(config.metrics.periods).toEqual(STREAM_CLIENT_DEFAULTS.metrics.periods)
                expect(config.metrics.maxPublishDelay).toEqual(123)
            })
            it('enabled', () => {
                const config = createStrictConfig({
                    metrics: true
                })
                expect(config.metrics.periods).toEqual(STREAM_CLIENT_DEFAULTS.metrics.periods)
                expect(config.metrics.maxPublishDelay).toEqual(STREAM_CLIENT_DEFAULTS.metrics.maxPublishDelay)
            })
            it('disabled', () => {
                const config = createStrictConfig({
                    metrics: false
                })
                expect(config.metrics.periods).toEqual([])
                expect(config.metrics.maxPublishDelay).toEqual(STREAM_CLIENT_DEFAULTS.metrics.maxPublishDelay)
            })
        })
    })
})
