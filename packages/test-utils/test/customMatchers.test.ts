import {} from '../src/customMatcherTypes'

describe('custom matchers', () => {
    it('happy path', () => {
        expect(new Uint8Array([1, 2, 3])).toEqualBinary(new Uint8Array([1, 2, 3]))
        expect(new Uint8Array([1, 2, 3])).not.toEqualBinary(new Uint8Array([4, 5, 6]))
    })

    it('throws error if assertion fails', () => {
        expect(() => {
            expect(new Uint8Array([1, 2, 3])).toEqualBinary(new Uint8Array([4, 5, 6]))
        }).toThrow('Binaries are not equal')
        expect(() => {
            expect(new Uint8Array([1, 2, 3])).not.toEqualBinary(new Uint8Array([1, 2, 3]))
        }).toThrow('Binaries are equal')
        expect(() => {
            expect('foobar' as any).toEqualBinary(new Uint8Array([1, 2, 3]))
        }).toThrow('Not an instance of Uint8Array (the object is an instance of String)')
        expect(() => {
            expect(undefined as any).toEqualBinary(new Uint8Array([1, 2, 3]))
        }).toThrow('Not an instance of Uint8Array (the object is undefined)')
    })

    it('invalid usage', () => {
        expect(() => {
            expect(new Uint8Array([1, 2, 3])).toEqualBinary('foobar' as any)
        }).toThrow(
            'Invalid assertion: the "expected" object should be an instance of Uint8Array (it is an instance of String)'
        )
        expect(() => {
            expect(new Uint8Array([1, 2, 3])).toEqualBinary(undefined as any)
        }).toThrow('Invalid assertion: the "expected" object should be an instance of Uint8Array (it is undefined)')
    })
})
