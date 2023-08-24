import { binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '../src/binaryUtils'

describe('binaryUtils', () => {

    it('can translate UTF8', () => {
        const utf8 = 'Hello, world!'
        const binary = utf8ToBinary(utf8)
        expect(binaryToUtf8(binary)).toEqual(utf8)
    })

    it('can translate hex', () => {
        const hex = '0x1234567890abcdef'
        const binary = hexToBinary(hex)
        expect(binaryToHex(binary, true)).toEqual(hex)
    })

})
