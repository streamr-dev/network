import { wait } from '@streamr/utils'
import { CachingMap } from '../../src/utils/CachingMap'

const DEFAULT_OPTS = {
    maxSize: 10000,
    maxAge: 30 * 60 * 1000,
    cacheKey: (args: any[]) => args[0]
}

describe('CachingMap', () => {
    it('caches & be cleared', async () => {
        const fn = jest.fn()
        const cache = new CachingMap(fn, DEFAULT_OPTS)
        await cache.get()
        expect(fn).toHaveBeenCalledTimes(1)
        await cache.get()
        expect(fn).toHaveBeenCalledTimes(1)
        await cache.get(1)
        expect(fn).toHaveBeenCalledTimes(2)
        await cache.get(1)
        expect(fn).toHaveBeenCalledTimes(2)
        await cache.get(2)
        expect(fn).toHaveBeenCalledTimes(3)
        await cache.get(1)
        expect(fn).toHaveBeenCalledTimes(3)
        await cache.get(2)
        expect(fn).toHaveBeenCalledTimes(3)
        cache.invalidate((v) => v === 1)
        await cache.get(1)
        expect(fn).toHaveBeenCalledTimes(4)
        cache.invalidate((v) => v === 1)
        await cache.get(1)
        expect(fn).toHaveBeenCalledTimes(5)
    })

    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        async function fn(_s: string): Promise<number> {
            return 3
        }

        const cache = new CachingMap(fn, DEFAULT_OPTS)
        const a: number = await cache.get('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        await cache.get()
        // @ts-expect-error too many args
        await cache.get('abc', 3)
        // @ts-expect-error wrong argument type
        await cache.get(3)

        // @ts-expect-error wrong return type
        const c: string = await cache.get('abc')
        expect(c).toEqual(3)
        cache.invalidate((_d: string) => true)
        const cache2 = new CachingMap(fn, {
            ...DEFAULT_OPTS,
            cacheKey: ([s]) => {
                return s.length
            }
        })

        cache2.invalidate((_d: number) => true)
    })

    it('does memoize consecutive calls', async () => {
        let i = 0
        const fn = async () => {
            i += 1
            return i
        }
        const memoized = new CachingMap(fn, DEFAULT_OPTS)
        const firstCall = memoized.get()
        const secondCall = memoized.get()

        expect(await Promise.all([firstCall, secondCall])).toEqual([1, 1])
    })

    it('can not be executed in parallel', async () => {
        const taskId1 = '0xbe406f5e1b7e951cd8e42ab28598671e5b73c3dd/test/75712/Encryption-0'
        const taskId2 = 'd/e/f'
        const calledWith: string[] = []
        const fn = jest.fn(async (key: string) => {
            calledWith.push(key)
            await wait(100)
            return key
        })

        const cache = new CachingMap(fn, {
            maxSize: 10000,
            maxAge: 1800000,
            cacheKey: ([v]) => {
                return v
            }
        })
        const task = Promise.all([
            cache.get(taskId1),
            cache.get(taskId2),
            cache.get(taskId1),
            cache.get(taskId2),
        ])
        task.catch(() => {})
        setImmediate(() => {
            cache.get(taskId1)
            cache.get(taskId1)
            cache.get(taskId2)
            cache.get(taskId2)
        })
        process.nextTick(() => {
            cache.get(taskId1)
            cache.get(taskId2)
            cache.get(taskId1)
            cache.get(taskId2)
        })
        setTimeout(() => {
            cache.get(taskId1)
            cache.get(taskId1)
            cache.get(taskId2)
            cache.get(taskId2)
        })
        await wait(10)
        cache.get(taskId2)
        cache.get(taskId2)
        cache.get(taskId1)
        cache.get(taskId1)
        await Promise.all([
            cache.get(taskId1),
            cache.get(taskId2),
            cache.get(taskId1),
            cache.get(taskId2),
        ])
        await task
        expect(fn).toHaveBeenCalledTimes(2)
        expect(calledWith).toEqual([taskId1, taskId2])
        await wait(200)
        expect(fn).toHaveBeenCalledTimes(2)
        expect(calledWith).toEqual([taskId1, taskId2])
    })
})
