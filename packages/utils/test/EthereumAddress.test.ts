import { toEthereumAddress } from '../src/EthereumAddress'

describe('toEthereumAddress', () => {
    it('invalid addresses', () => {
        expect(() => toEthereumAddress('')).toThrowError()
        expect(() => toEthereumAddress('0x')).toThrowError()
        expect(() => toEthereumAddress('0xabcabc')).toThrowError()
        expect(() => toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrowError() // missing 1 char
        expect(() => toEthereumAddress('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrowError()
        expect(() => toEthereumAddress('0xhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh')).toThrowError()
        expect(() => toEthereumAddress('hello.eth')).toThrowError()
    })

    it('valid addresses are lowercased', () => {
        expect(toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
            .toEqual('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        expect(toEthereumAddress('0xAAAAAAAAAAccccccccccBBBBBBBBBB1111155555'))
            .toEqual('0xaaaaaaaaaaccccccccccbbbbbbbbbb1111155555')
    })
})
