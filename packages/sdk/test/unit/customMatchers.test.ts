describe('custom matchers', () => {

    it('happy path', () => {
        expect(new Uint8Array([1, 2, 3])).toEqualBinary(new Uint8Array([1, 2, 3]))
    })

    it('no match', () => {
        expect(new Uint8Array([1, 2, 3])).not.toEqualBinary(new Uint8Array([4, 5, 6]))
    })

    it('invalid argument', () => {
        expect(() => {
            expect('foobar' as any).toEqualBinary(new Uint8Array([1, 2, 3]))
        }).toThrow('Expected an instance of Uint8Array')
    })
})
