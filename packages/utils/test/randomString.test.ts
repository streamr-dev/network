import { DEFAULT_CHARSET, randomString } from '../src/randomString'

function assertStringConsistsOfCharset(actual: string, expectedCharset: string): void {
    return actual.split('').forEach((char) => {
        expect(char).toBeOneOf(expectedCharset.split(''))
    })
}

describe('randomString', () => {
    it('generates a random string of given length', () => {
        const str = randomString(61)
        expect(str).toHaveLength(61)
    })

    it('generated random string consists of default characters', () => {
        const str = randomString(62)
        assertStringConsistsOfCharset(str, DEFAULT_CHARSET)
    })

    it('can generate a random string of given length with custom charset', () => {
        const str = randomString(62, 'åä^@£$!&')
        expect(str).toHaveLength(62)
        assertStringConsistsOfCharset(str, 'åä^@£$!&')
    })
})
