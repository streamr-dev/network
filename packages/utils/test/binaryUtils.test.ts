import { areEqualBinaries, binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '../src/binaryUtils'

describe('binaryUtils', () => {

    it('can translate UTF8', () => {
        const utf8 = 'Hello, world!'
        const binary = utf8ToBinary(utf8)
        expect(binaryToUtf8(binary)).toEqual(utf8)
    })

    it('can translate hex', () => {
        const hex = '0x1234567890abcdef'
        const binary = hexToBinary(hex)
        expect(binaryToHex(binary!, true)).toEqual(hex)
    })

    it('hexToBinary no prefix', () => {
        const hex = '1234567890abcdef'
        const binary = hexToBinary(hex)
        expect(binaryToHex(binary!, false)).toEqual(hex)
    })

    it('hexToBinary malformed input retruns undefined', () => {
        const hex = '0x123MMMM'
        const binary = hexToBinary(hex)
        expect(binary).toEqual(undefined)
    })

    it('hexToBinary odd input', () => {
        const hex = '0x123'
        const binary = hexToBinary(hex)
        expect(binary).toEqual(undefined)
    })

    it('areEqualBinaries', () => {
        const binary1 = new Uint8Array([1, 2, 3])
        const binary2 = new Uint8Array([1, 2, 3])
        const binary3 = new Uint8Array([1, 2, 4])
        expect(areEqualBinaries(binary1, binary2)).toEqual(true)
        expect(areEqualBinaries(binary1, binary3)).toEqual(false)
    })

})
