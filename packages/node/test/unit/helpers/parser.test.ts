import { parse } from 'qs'
import { parsePositiveInteger, parseQueryAndBase, parseQueryParameter } from '../../../src/helpers/parser'

describe('parse', () => {
    describe('parseQueryParameter', () => {
        it('happy path', () => {
            const query = parse('x=3')
            const value = parseQueryParameter('x', query, parsePositiveInteger)
            expect(value).toBe(3)
        })
        it('no value', () => {
            const query = parse('')
            const value = parseQueryParameter('x', query, parsePositiveInteger)
            expect(value).toBe(undefined)
        })
        it('parse error', () => {
            const query = parse('x=foo')
            expect(() => parseQueryParameter('x', query, parsePositiveInteger)).toThrow()
        })
    })

    describe('parseQueryAndBase', () => {
        it('with parameters', () => {
            const { base, query } = parseQueryAndBase('foobar?lorem=ipsum')
            expect(base).toBe('foobar')
            expect(query.lorem).toBe('ipsum')
        })
        it('without parameters', () => {
            const { base, query } = parseQueryAndBase('foobar')
            expect(base).toBe('foobar')
            expect(query).toEqual({})
        })
        it('empty query', () => {
            const { base, query } = parseQueryAndBase('foobar?')
            expect(base).toBe('foobar')
            expect(query).toEqual({})
        })
    })
})
