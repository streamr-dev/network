import { toEthereumAddress } from '../src/EthereumAddress'

describe('toEthereumAddress', () => {
    it('invalid addresses', () => {
        expect(() => toEthereumAddress('')).toThrow()
        expect(() => toEthereumAddress('0x')).toThrow()
        expect(() => toEthereumAddress('0xabcabc')).toThrow()
        expect(() => toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrow() // missing 1 char
        expect(() => toEthereumAddress('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrow()
        expect(() => toEthereumAddress('0xhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh')).toThrow()
        expect(() => toEthereumAddress('hello.eth')).toThrow()
    })

    it('valid addresses are lowercased', () => {
        expect(toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toEqual(
            '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )
        expect(toEthereumAddress('0xAAAAAAAAAAccccccccccBBBBBBBBBB1111155555')).toEqual(
            '0xaaaaaaaaaaccccccccccbbbbbbbbbb1111155555'
        )
    })
})
