import { wait } from '@streamr/utils'
import { Mapping } from '../../src/utils/Mapping'

describe('Mapping', () => {

    it('create', async () => {
        const mapping = new Mapping(async (p1: string, p2: number) => `${p1}${p2}`)
        expect(await mapping.get('foo', 1)).toBe('foo1')
        expect(await mapping.get('bar', 2)).toBe('bar2')
    })

    it('memorize', async () => {
        let evaluationIndex = 0
        const mapping = new Mapping(async (_p: string) => {
            const result = evaluationIndex
            evaluationIndex++
            return result
        })
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('foo')).toBe(0)
    })

    it('undefined', async () => {
        const valueFactory = jest.fn().mockResolvedValue(undefined)
        const mapping = new Mapping(valueFactory)
        expect(await mapping.get('foo')).toBe(undefined)
        expect(await mapping.get('foo')).toBe(undefined)
        expect(valueFactory).toHaveBeenCalledTimes(1)
    })

    it('rejections are not cached', async () => {
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            throw new Error(`error ${p1}-${p2}`)
        })
        const mapping = new Mapping(valueFactory)
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('throws are not cached', async () => {
        const valueFactory = jest.fn().mockImplementation((p1: string, p2: number) => {
            throw new Error(`error ${p1}-${p2}`)
        })
        const mapping = new Mapping(valueFactory)
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        await expect(mapping.get('foo', 1)).rejects.toEqual(new Error('error foo-1'))
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })

    it('concurrency', async () => {
        const valueFactory = jest.fn().mockImplementation(async (p1: string, p2: number) => {
            await wait(50)
            return `${p1}${p2}`
        })
        const mapping = new Mapping(valueFactory)
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
})
