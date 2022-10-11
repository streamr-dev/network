import { generateMnemonicFromAddress } from '../../../src/helpers/generateMnemonicFromAddress'
import { randomEthereumAddress } from 'streamr-test-utils'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'

describe(generateMnemonicFromAddress, () => {
    it('always returns same mnemonic for the same address', () => {
        const address = randomEthereumAddress()
        const result1 = generateMnemonicFromAddress(address)
        const result2 = generateMnemonicFromAddress(address)
        expect(result1).toEqual(result2)
        expect(result1).not.toEqual('') // is not empty
        expect(result1.trim()).toEqual(result1) // no whitespace
    })

    it('ignores address case', () => {
        const address = randomEthereumAddress()
        const result1 = generateMnemonicFromAddress(address.toLowerCase() as EthereumAddress)
        const result2 = generateMnemonicFromAddress(address)
        expect(result1).toEqual(result2)
    })

    it('matches hardcoded value i.e. algorithm has not changed', () => {
        const actual = generateMnemonicFromAddress(toEthereumAddress('0xC983de43c5d22186F1e051c6da419c5a17F19544'))
        expect(actual).toEqual('Sister Bus Movie')
    })
})
