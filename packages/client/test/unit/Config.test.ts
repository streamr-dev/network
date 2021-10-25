import set from 'lodash/set'
import { arrayify, BytesLike } from '@ethersproject/bytes'

import { StreamrClient } from '../../src/StreamrClient'
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
            expect(await client.getAddress()).toBe('0xfcad0b19bb29d4674531d6f115237e16afce377c')
        })
        it('byteslike', async () => {
            const client = createAuthenticatedClient(arrayify('0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'))
            expect(await client.getAddress()).toBe('0xfcad0b19bb29d4674531d6f115237e16afce377c')
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
    })
})
