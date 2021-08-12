import * as bip39 from 'bip39'

import * as NodeUtil  from '../../../src/utils/NodeUtil'

jest.mock('bip39')

describe('NodeUtil', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('generateMnemonicFromAddress', () => {
        it('returns a mnemonic for an address', () => {
            const oldWordlist = bip39.wordlists
            const wordlist = ['solid', 'wooden', 'table', 'tree', 'desk', 'computer', 'android']

            Object.defineProperty(bip39, 'wordlists', {
                get: () => ({
                    english: wordlist,
                }),
            })
            const entropyToMnemonicMock = jest.fn((id, list) => list.join(' '))
            jest.spyOn(bip39, 'entropyToMnemonic').mockImplementation(entropyToMnemonicMock)

            const result = NodeUtil.generateMnemonicFromAddress('0x123')

            expect(entropyToMnemonicMock).toBeCalledWith('123', wordlist)
            expect(result).toStrictEqual('Solid Wooden Table')

            Object.defineProperty(bip39, 'wordlists', oldWordlist)
        })
    })

    describe('parseAddressFromNodeId', () => {
        it('strips hash and returns the address', () => {
            expect(
                NodeUtil.parseAddressFromNodeId('0xC983de43c5d22186F1e051c6da419c5a17F19544#4caa44ec-c26d-4cb2-9056-c54e60eceafe')
            ).toBe('0xC983de43c5d22186F1e051c6da419c5a17F19544')
        })

        it('returns address as is', () => {
            expect(
                NodeUtil.parseAddressFromNodeId('0xC983de43c5d22186F1e051c6da419c5a17F19544')
            ).toBe('0xC983de43c5d22186F1e051c6da419c5a17F19544')
        })
    })
})
