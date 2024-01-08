import { CacheAsyncFn } from '../../src/utils/caches'
import { wait } from '@streamr/utils'

describe('CacheAsyncFn', () => {

    let plainFn: jest.Mock<(key1: string, key2: string) => Promise<string>>
    let cachedFn: (key1: string, key2: string) => Promise<string>

    beforeEach(() => {
        plainFn = jest.fn().mockImplementation(async (key1: string, key2: string) => {
            await wait(100)
            return `${key1}${key2}`.toUpperCase()
        })
        cachedFn = CacheAsyncFn(plainFn as any, {
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
})
