import { wait } from '@streamr/utils'
import { Mapping } from '../../src/utils/Mapping'
import { range } from 'lodash'

const BASE_OPTS = {
    maxSize: 999999
}

describe('Mapping', () => {

    it('create', async () => {
        const mapping = new Mapping({
            valueFactory: async (p1: string, p2: number) => `${p1}${p2}`,
            ...BASE_OPTS
        })
        expect(await mapping.get('foo', 1)).toBe('foo1')
        expect(await mapping.get('bar', 2)).toBe('bar2')
    })

    it('memorize', async () => {
        let evaluationIndex = 0
        const mapping = new Mapping({
            valueFactory: async (_p: string) => {
                const result = evaluationIndex
                evaluationIndex++
                return result
            },
            ...BASE_OPTS
        })
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('foo')).toBe(0)
    })

    it('undefined', async () => {
        const valueFactory = jest.fn().mockResolvedValue(undefined)
        const mapping = new Mapping({ valueFactory, ...BASE_OPTS })
        expect(await mapping.get('foo')).toBe(undefined)
        expect(await mapping.get('foo')).toBe(undefined)
        expect(valueFactory).toHaveBeenCalledTimes(1)
    })

    it('rejections are not cached', async () => {
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            throw new Error(`error ${p1}-${p2}`)
        })
        const mapping = new Mapping({ valueFactory, ...BASE_OPTS })
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('throws are not cached', async () => {
        const valueFactory = jest.fn().mockImplementation((p1: string, p2: number) => {
            throw new Error(`error ${p1}-${p2}`)
        })
        const mapping = new Mapping({ valueFactory, ...BASE_OPTS })
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('isCacheableValue', async () => {
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            return `${p1}${p2}`
        })
        const mapping = new Mapping({ valueFactory, isCacheableValue: (value: string) => value === 'foo1', ...BASE_OPTS })
        const result1 = await mapping.get('foo', 1)
        const result2 = await mapping.get('foo', 1)
        expect(result1).toBe('foo1')
        expect(result2).toBe('foo1')
        expect(valueFactory).toHaveBeenCalledTimes(1)
        const result3 = await mapping.get('foo', 2)
        const result4 = await mapping.get('foo', 2)
        expect(result3).toBe('foo2')
        expect(result4).toBe('foo2')
        expect(valueFactory).toHaveBeenCalledTimes(1 + 2)  // two additional calls as neither of the new calls were cached
    })
    
    it('concurrency', async () => {
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            await wait(50)
            return `${p1}${p2}`
        })
        const mapping = new Mapping({ valueFactory, ...BASE_OPTS })
        const results = await Promise.all([
            mapping.get('foo', 1),
            mapping.get('foo', 2),
            mapping.get('foo', 2),
            mapping.get('foo', 1),
            mapping.get('foo', 1)
        ])
        expect(valueFactory).toHaveBeenCalledTimes(2)
        expect(results).toEqual([
            'foo1',
            'foo2',
            'foo2',
            'foo1',
            'foo1'
        ])
    })

    it('max size', async () => {
        const SIZE = 3
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            return `${p1}${p2}`
        })
        const mapping = new Mapping({ valueFactory, ...BASE_OPTS, maxSize: 3 })
        const ids = range(SIZE)
        for (const id of ids) {
            await mapping.get('foo', id)
        }
        expect(valueFactory).toHaveBeenCalledTimes(3)
        // add a value which is not in cache
        await mapping.get('foo', -1)
        expect(valueFactory).toHaveBeenCalledTimes(4)
        // one of the items was removed from cache when -1 was added, now we is re-add that
        // (we don't know which item it was)
        for (const id of ids) {
            await mapping.get('foo', id)
        }
        expect(valueFactory).toHaveBeenCalledTimes(5)
    })

    it('max age', async () => {
        const MAX_AGE = 100
        const JITTER = 50
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            return `${p1}${p2}`
        })
        const mapping = new Mapping({ valueFactory, ...BASE_OPTS, maxAge: MAX_AGE })
        await mapping.get('foo', 1)
        await wait(MAX_AGE + JITTER)
        await mapping.get('foo', 1)
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })
})
