import { arrayify, BytesLike } from '@ethersproject/bytes'
import { StreamrClient } from '../../src/StreamrClient'

const createClient = (privateKey: BytesLike) => {
    return new StreamrClient({
        auth: {
            privateKey
        }
    })
}

describe('Config', () => {
    describe('private key', () => {
        it('string', async () => {
            const client = createClient('0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF')
            expect(await client.getAddress()).toBe('0xFCAd0B19bB29D4674531d6f115237E16AfCE377c')
        })
        it('byteslike', async () => {
            const client = createClient(arrayify('0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'))
            expect(await client.getAddress()).toBe('0xFCAd0B19bB29D4674531d6f115237E16AfCE377c')
        })
    })
})
