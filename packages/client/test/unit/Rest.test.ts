import 'reflect-metadata'
import { createQueryString } from '../../src/Rest'

describe('Rest', () => {
    it('query parameters with null/undefined', () => {
        const actual = createQueryString({
            a: 'foo',
            b: undefined,
            c: null,
            d: 123,
            e: ['x', 'y']
        })
        expect(actual).toBe('a=foo&d=123&e=x%2Cy')
    })
})
