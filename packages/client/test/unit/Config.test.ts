import set from 'lodash/set'
import { arrayify, BytesLike } from '@ethersproject/bytes'

import { StreamrClient } from '../../src/StreamrClient'
import { DEFAULTS } from '../../src/Config'
import config from '../../src/ConfigTest'

describe('Config', () => {
    describe('validate ethereum addresses', () => {
        const createClient = (propertyPaths: string, value: string|undefined|null) => {
            const opts: any = {}
            set(opts, propertyPaths, value)
            return new StreamrClient(opts)
        }
        const propertyPaths: string[] = [
            'streamrNodeAddress',
            'tokenAddress',
            'tokenSidechainAddress',
            'dataUnion.factoryMainnetAddress',
            'dataUnion.factorySidechainAddress',
            'dataUnion.templateMainnetAddress',
            'dataUnion.templateSidechainAddress',
            'storageNode.address'
        ]
        for (const propertyPath of propertyPaths) {
            it(propertyPath, () => {
                const errorMessage = `${propertyPath} is not a valid Ethereum address`
                expect(() => createClient(propertyPath, 'invalid-address')).toThrow(errorMessage)
                expect(() => createClient(propertyPath, undefined)).toThrow(errorMessage)
                expect(() => createClient(propertyPath, null)).toThrow(errorMessage)
                expect(() => createClient(propertyPath, '0x1234567890123456789012345678901234567890')).not.toThrow()
            })
        }
    })

    describe('private key', () => {
        const createAuthenticatedClient = (privateKey: BytesLike) => {
            return new StreamrClient({
                auth: {
                    privateKey
                }
            })
        }
        it('string', async () => {
            const client = createAuthenticatedClient('0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF')
            expect(await client.getAddress()).toBe('0xFCAd0B19bB29D4674531d6f115237E16AfCE377c')
        })
        it('byteslike', async () => {
            const client = createAuthenticatedClient(arrayify('0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'))
            expect(await client.getAddress()).toBe('0xFCAd0B19bB29D4674531d6f115237E16AfCE377c')
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
                storageNodeRegistry: [{
                    address: '0xde1112f631486CfC759A50196853011528bC5FA0',
                    url: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8891`
                }],
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

        it('passes metricsContext by reference', () => {
            const clientDefaults = new StreamrClient()
            const clientOverrides = new StreamrClient({
                network: {
                    metricsContext: clientDefaults.options.network.metricsContext,
                }
            })
            // network object is different
            expect(clientOverrides.options.network).not.toBe(clientDefaults.options.network)
            // but metricsContext is same instance
            expect(clientOverrides.options.network.metricsContext).toBe(clientDefaults.options.network.metricsContext)
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
