import 'reflect-metadata'
import { HttpUtil } from '../../src/HttpUtil'
import { mockLoggerFactory } from '../test-utils/utils'

describe('HttpUtil', () => {
    it('query parameters with null/undefined', () => {
        const httpUtil = new HttpUtil(mockLoggerFactory())
        const actual = httpUtil.createQueryString({
            a: 'foo',
            b: undefined,
            c: null,
            d: 123,
            e: ['x', 'y']
        })
        expect(actual).toBe('a=foo&d=123&e=x%2Cy')
    })
})
