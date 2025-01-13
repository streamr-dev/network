import { wait } from '@streamr/utils'
import { createCacheMap, createLazyMap } from '../../src/utils/Mapping'
import { range } from 'lodash'

describe('Mapping', () => {
    it('create', async () => {
        const mapping = createLazyMap<[string, number], string>({
            valueFactory: async ([p1, p2]: [string, number]) => `${p1}${p2}`
        })
        expect(await mapping.get(['foo', 1])).toBe('foo1')
        expect(await mapping.get(['bar', 2])).toBe('bar2')
    })

    it('memorize', async () => {
        let evaluationIndex = 0
        const mapping = createLazyMap<string, number>({
            valueFactory: async (_p) => {
                const result = evaluationIndex
                evaluationIndex++
                return result
            }
        })
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('foo')).toBe(0)
    })

    it('undefined', async () => {
        const valueFactory = jest.fn().mockResolvedValue(undefined)
        const mapping = createLazyMap({ valueFactory })
        expect(await mapping.get(['foo'])).toBe(undefined)
        expect(await mapping.get(['foo'])).toBe(undefined)
        expect(valueFactory).toHaveBeenCalledTimes(1)
    })

    it('rejections are not cached', async () => {
        const valueFactory = jest.fn().mockImplementation(async ([p1, p2]: [string, number]) => {
            throw new Error(`error ${p1}-${p2}`)
        })
        const mapping = createLazyMap({ valueFactory })
        await expect(mapping.get(['foo', 1])).rejects.toEqual(new Error('error foo-1'))
        await expect(mapping.get(['foo', 1])).rejects.toEqual(new Error('error foo-1'))
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('throws are not cached', async () => {
        const valueFactory = jest.fn().mockImplementation(([p1, p2]: [string, number]) => {
            throw new Error(`error ${p1}-${p2}`)
        })
        const mapping = createLazyMap({ valueFactory })
        await expect(mapping.get(['foo', 1])).rejects.toEqual(new Error('error foo-1'))
        await expect(mapping.get(['foo', 1])).rejects.toEqual(new Error('error foo-1'))
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('isCacheableValue', async () => {
        const valueFactory = jest.fn().mockImplementation(async ([p1, p2]: [string, number]) => {
            return `${p1}${p2}`
        })
        const mapping = createLazyMap({ valueFactory, isCacheableValue: (value: string) => value === 'foo1' })
        const result1 = await mapping.get(['foo', 1])
        const result2 = await mapping.get(['foo', 1])
        expect(result1).toBe('foo1')
        expect(result2).toBe('foo1')
        expect(valueFactory).toHaveBeenCalledTimes(1)
        const result3 = await mapping.get(['foo', 2])
        const result4 = await mapping.get(['foo', 2])
        expect(result3).toBe('foo2')
        expect(result4).toBe('foo2')
        expect(valueFactory).toHaveBeenCalledTimes(1 + 2) // two additional calls as neither of the new calls was cached
    })

    it('concurrency', async () => {
        const valueFactory = jest.fn().mockImplementation(async ([p1, p2]: [string, number]) => {
            await wait(50)
            return `${p1}${p2}`
        })
        const mapping = createLazyMap({ valueFactory })
        const results = await Promise.all([
            mapping.get(['foo', 1]),
            mapping.get(['foo', 2]),
            mapping.get(['foo', 2]),
            mapping.get(['foo', 1]),
            mapping.get(['foo', 1])
        ])
        expect(valueFactory).toHaveBeenCalledTimes(2)
        expect(results).toEqual(['foo1', 'foo2', 'foo2', 'foo1', 'foo1'])
    })

    it('max size', async () => {
        const MAX_SIZE = 3
        const valueFactory = jest.fn().mockImplementation(async ([p1, p2]: [string, number]) => {
            return `${p1}${p2}`
        })
        const mapping = createCacheMap({ valueFactory, maxSize: MAX_SIZE })
        const ids = range(MAX_SIZE)
        /**
         * Each call to `get` is considered usage. The following populates the cache with
         * entries for: foo0, foo1, foo2 (3 in total).
         */
        for (const id of ids) {
            await mapping.get(['foo', id])
        }
        expect(valueFactory).toHaveBeenCalledTimes(MAX_SIZE)
        /**
         * Calling `get` on a key that's not in the cache causes usage. It will discard
         * an item associated to `foo0` key (least recently used).
         */
        await mapping.get(['foo', -1])
        expect(valueFactory).toHaveBeenCalledTimes(MAX_SIZE + 1)
        /**
         * The current list of keys (most-to-least recently used) goes as follows: foo-1,
         * foo2, foo1. Going through all ids below will reconstruct the initial collection
         * causing 3 hits.
         */
        for (const id of ids) {
            await mapping.get(['foo', id])
        }
        expect(valueFactory).toHaveBeenCalledTimes(MAX_SIZE + 1 + MAX_SIZE)
    })

    it('max age', async () => {
        const MAX_AGE = 100
        const JITTER = 50
        const valueFactory = jest.fn().mockImplementation(async ([p1, p2]: [string, number]) => {
            return `${p1}${p2}`
        })
        const mapping = createCacheMap({ valueFactory, maxSize: 999999, maxAge: MAX_AGE })
        await mapping.get(['foo', 1])
        await wait(MAX_AGE + JITTER)
        await mapping.get(['foo', 1])
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('invalidate', async () => {
        const mapping = createLazyMap<[string, number], string>({
            valueFactory: async ([p1, p2]: [string, number]) => `${p1}${p2}`
        })
        mapping.set(['foo', 1], 'foo1')
        mapping.set(['bar', 1], 'bar1')
        await mapping.get(['foo', 2])
        await mapping.get(['bar', 2])
        expect([...mapping.values()]).toIncludeSameMembers(['foo1', 'bar1', 'foo2', 'bar2'])
        mapping.invalidate(([p1]) => p1 === 'bar')
        expect([...mapping.values()]).toIncludeSameMembers(['foo1', 'foo2'])
    })
})
