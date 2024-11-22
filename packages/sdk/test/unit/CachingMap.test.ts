import { CachingMap } from '../../src/utils/CachingMap'
import { wait } from '@streamr/utils'

describe('CachingMap', () => {

    let plainFn: jest.Mock<Promise<string>, [key1: string, key2: string]>
    let cache: CachingMap<string, string, [key1: string, key2: string]>

    beforeEach(() => {
        plainFn = jest.fn()
        plainFn.mockImplementation(async (key1: string, key2: string) => {
            await wait(100)
            return `${key1}${key2}`.toUpperCase()
        })
        cache = new CachingMap(plainFn as any, {
            maxSize: 10000,
            maxAge: 30 * 60 * 1000,
            cacheKey: ([key1, key2]) => `${key1};${key2}`
        })
    })

    it('happy path', async () => {
        const result1 = await cache.get('foo', 'bar')
        const result2 = await cache.get('foo', 'bar')
        expect(result1).toBe('FOOBAR')
        expect(result2).toBe('FOOBAR')
        expect(plainFn).toHaveBeenCalledTimes(1)
    })

    it('miss', async () => {
        const result1 = await cache.get('foo', 'x')
        const result2 = await cache.get('foo', 'y')
        expect(result1).toBe('FOOX')
        expect(result2).toBe('FOOY')
        expect(plainFn).toHaveBeenCalledTimes(2)
    })

    it('concurrency', async () => {
        const [result1, result2] = await Promise.all([
            cache.get('foo', 'bar'),
            cache.get('foo', 'bar')
        ])
        expect(result1).toBe('FOOBAR')
        expect(result2).toBe('FOOBAR')
        expect(plainFn).toHaveBeenCalledTimes(1)
    })

    it('rejections are not cached', async () => {
        plainFn.mockImplementation(async (key1: string, key2: string) => {
            throw new Error(`error ${key1}-${key2}`)
        })
        await expect(cache.get('foo', 'x')).rejects.toEqual(new Error('error foo-x'))
        await expect(cache.get('foo', 'x')).rejects.toEqual(new Error('error foo-x'))

        expect(plainFn).toHaveBeenCalledTimes(2) // would be 1 if rejections were cached
    })

    it('throws are not cached', async () => {
        plainFn.mockImplementation((key1: string, key2: string) => {
            throw new Error(`error ${key1}-${key2}`)
        })
        await expect(cache.get('foo', 'x')).rejects.toEqual(new Error('error foo-x'))
        await expect(cache.get('foo', 'x')).rejects.toEqual(new Error('error foo-x'))

        expect(plainFn).toHaveBeenCalledTimes(2) // would be 1 if throws were cached
    })
})
