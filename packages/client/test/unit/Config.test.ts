import { StreamrClient } from '../../src/StreamrClient'
import { DEFAULTS } from '../../src/Config'
import config from '../../src/ConfigTest'

describe('Config', () => {
    describe('validate', () => {
        it('additional property', () => {
            expect(() => {
                return new StreamrClient({
                    network: {
                        foo: 'bar'
                    }
                } as any)
            }).toThrow('/network must NOT have additional properties: foo')
        })

        it('missing property', () => {
            expect(() => {
                return new StreamrClient({
                    network: {
                        trackers: [{
                            id: 'foo',
                            ws: 'foo'
                        }]
                    }
                } as any)
            }).toThrow('/network/trackers/0 must have required property \'http\'')
        })

        describe('invalid property format', () => {
            it('primitive', () => {
                expect(() => {
                    return new StreamrClient({
                        network: {
                            acceptProxyConnections: 123
                        }
                    } as any)
                }).toThrow('/network/acceptProxyConnections must be boolean')
            })

            it('enum', () => {
                expect(() => {
                    return new StreamrClient({
                        verifySignatures: 'foo'
                    } as any)
                }).toThrow('verifySignatures must be equal to one of the allowed values')
            })

            it('ajv-format', () => {
                expect(() => {
                    return new StreamrClient({
                        storageNodeRegistry: [{
                            address: '0x000000000000000000000000000000000000aB12',
                            url: 'foo'
                        }]
                    } as any)
                }).toThrow('/storageNodeRegistry/0/url must match format "uri"')
            })

            it('ethereum address', () => {
                expect(() => {
                    return new StreamrClient({
                        storageNodeRegistry: [{
                            address: 'foo',
                            url: 'http://foo.bar'
                        }]
                    } as any)
                }).toThrow('/storageNodeRegistry/0/address must match format "ethereum-address"')
            })

            it('ethereum private key', () => {
                expect(() => {
                    return new StreamrClient({
                        auth: {
                            privateKey: 'foo'
                        }
                    } as any)
                }).toThrow('/auth/privateKey must match format "ethereum-private-key"')
            })
        })
    })

    describe('merging configs', () => {
        it('works with no arguments', () => {
            expect(new StreamrClient()).toBeInstanceOf(StreamrClient)
        })

        it('can override storageNodeRegistry & network.trackers arrays', () => {
            const clientDefaults = new StreamrClient()
            const clientOverrides = new StreamrClient(config)
            expect(clientOverrides.options.storageNodeRegistry).not.toEqual(clientDefaults.options.storageNodeRegistry)
            expect(clientOverrides.options.storageNodeRegistry).toEqual(config.storageNodeRegistry)
            expect(clientOverrides.options.network.trackers).not.toEqual(clientDefaults.options.network.trackers)
            expect(clientOverrides.options.network.trackers).toEqual(config.network.trackers)
        })

        it('can override storageNodeRegistry as contract', () => {
            const clientDefaults = new StreamrClient()
            const clientOverrides = new StreamrClient({
                storageNodeRegistry: {
                    contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
                    jsonRpcProvider: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8546`,
                },
            })
            expect(clientOverrides.options.storageNodeRegistry).not.toEqual(clientDefaults.options.storageNodeRegistry)
        })

        it('can override storageNodeRegistry as array of nodes', () => {
            const clientDefaults = new StreamrClient()
            const clientOverrides = new StreamrClient({
                storageNodeRegistry: {
                    contractAddress: '0xde1112f631486CfC759A50196853011528bC5FA0',
                    jsonRpcProvider: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8891`
                },
            })
            expect(clientOverrides.options.storageNodeRegistry).not.toEqual(clientDefaults.options.storageNodeRegistry)
        })

        it('network can be empty', () => {
            const clientDefaults = new StreamrClient()
            const clientOverrides = new StreamrClient({
                network: {}
            })
            expect(clientOverrides.options.network).toEqual(clientDefaults.options.network)
            expect(Array.isArray(clientOverrides.options.network.trackers)).toBeTruthy()
            expect(clientOverrides.options.network.trackers).toEqual(DEFAULTS.network.trackers)
        })

        it('can override trackers', () => {
            const trackers = [
                {
                    id: '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
                    ws: 'wss://testnet3.streamr.network:30401',
                    http: 'https://testnet3.streamr.network:30401'
                },
            ]
            const clientOverrides = new StreamrClient({
                network: {
                    trackers,
                }
            })
            expect(clientOverrides.options.network.trackers).toEqual(trackers)
            expect(clientOverrides.options.network.trackers).not.toBe(trackers)
            expect(clientOverrides.options.network.trackers[0]).not.toBe(trackers[0])
        })

        it('can override debug settings', () => {
            const debugPartial = {
                inspectOpts: {
                    depth: 99,
                }
            }
            const debugFull = {
                inspectOpts: {
                    depth: 88,
                    maxStringLength: 3
                }
            }

            const clientDefaults = new StreamrClient()
            const clientOverrides1 = new StreamrClient({
                debug: debugPartial,
            })
            const clientOverrides2 = new StreamrClient({
                debug: debugFull,
            })
            expect(clientOverrides1.options.debug).toEqual({
                ...clientDefaults.options.debug,
                inspectOpts: {
                    ...clientDefaults.options.debug.inspectOpts,
                    ...debugPartial.inspectOpts,
                }
            })
            expect(clientOverrides2.options.debug).toEqual({
                ...clientDefaults.options.debug,
                inspectOpts: {
                    ...clientDefaults.options.debug.inspectOpts,
                    ...debugFull.inspectOpts,
                }
            })
        })

    })
})
