import { arrayify, BytesLike } from '@ethersproject/bytes'
import { StreamrClient } from '../../src/StreamrClient'
import set from 'lodash.set'

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
            'dataUnion.templateSidechainAddress'
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
})
