import { CacheAsyncFn } from '../../src/utils/caches'
import { wait } from '@streamr/utils'

describe('CacheAsyncFn', () => {

    let plainFn: jest.Mock<Promise<string>, [key1: string, key2: string]>
    let cachedFn: (key1: string, key2: string) => Promise<string>

    beforeEach(() => {
        plainFn = jest.fn()
        plainFn.mockImplementation(async (key1: string, key2: string) => {
            await wait(100)
            return `${key1}${key2}`.toUpperCase()
        })
        cachedFn = CacheAsyncFn(plainFn as any, {
            maxSize: 10000,
            maxAge: 30 * 60 * 1000,
            cacheKey: ([key1, key2]) => `${key1};${key2}`
        })
    })

    it('happy path', async () => {
        const result1 = await cachedFn('foo', 'bar')
        const result2 = await cachedFn('foo', 'bar')
        expect(result1).toBe('FOOBAR')
        expect(result2).toBe('FOOBAR')
        expect(plainFn).toBeCalledTimes(1)
    })

    it('miss', async () => {
        const result1 = await cachedFn('foo', 'x')
        const result2 = await cachedFn('foo', 'y')
        expect(result1).toBe('FOOX')
        expect(result2).toBe('FOOY')
        expect(plainFn).toBeCalledTimes(2)
    })

    it('concurrency', async () => {
        const [result1, result2] = await Promise.all([
            cachedFn('foo', 'bar'),
            cachedFn('foo', 'bar')
        ])
        expect(result1).toBe('FOOBAR')
        expect(result2).toBe('FOOBAR')
        expect(plainFn).toBeCalledTimes(1)
    })

    it('rejections are not cached', async () => {
        plainFn.mockImplementation(async (key1: string, key2: string) => {
            throw new Error(`error ${key1}-${key2}`)
        })
        await expect(cachedFn('foo', 'x')).rejects.toEqual(new Error('error foo-x'))
        await expect(cachedFn('foo', 'x')).rejects.toEqual(new Error('error foo-x'))

        expect(plainFn).toBeCalledTimes(2) // would be 1 if rejections were cached
    })

    it('throws are not cached', async () => {
        plainFn.mockImplementation((key1: string, key2: string) => {
            throw new Error(`error ${key1}-${key2}`)
        })
        await expect(cachedFn('foo', 'x')).rejects.toEqual(new Error('error foo-x'))
        await expect(cachedFn('foo', 'x')).rejects.toEqual(new Error('error foo-x'))

        expect(plainFn).toBeCalledTimes(2) // would be 1 if throws were cached
    })
})
