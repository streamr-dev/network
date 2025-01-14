import { toEthereumAddressOrENSName } from '../src/toEthereumAddressOrENSName'

describe('toEthereumAddressOrENSName', () => {
    it('returns ethereum address (lowercased) given ethereum address', () => {
        expect(toEthereumAddressOrENSName('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toEqual(
            '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )
    })

    it('returns ens name (lowercased) given ens name', () => {
        expect(toEthereumAddressOrENSName('VALID.eTh')).toEqual('valid.eth')
    })

    it('throws given invalid value', () => {
        expect(() => toEthereumAddressOrENSName('invalid')).toThrow()
    })
})
