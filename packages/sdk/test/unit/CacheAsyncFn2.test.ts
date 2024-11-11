import { wait } from '@streamr/utils'
import { CacheAsyncFn } from '../../src/utils/caches'

const DEFAULT_OPTS = {
    maxSize: 10000,
    maxAge: 30 * 60 * 1000,
    cacheKey: (args: any[]) => args[0]
}

describe('CacheAsyncFn', () => {
    it('caches & be cleared', async () => {
        const fn = jest.fn()
        const cachedFn = CacheAsyncFn(fn, DEFAULT_OPTS)
        await cachedFn()
        expect(fn).toHaveBeenCalledTimes(1)
        await cachedFn()
        expect(fn).toHaveBeenCalledTimes(1)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(2)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(2)
        await cachedFn(2)
        expect(fn).toHaveBeenCalledTimes(3)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(3)
        await cachedFn(2)
        expect(fn).toHaveBeenCalledTimes(3)
        cachedFn.clearMatching((v) => v === 1)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(4)
        cachedFn.clearMatching((v) => v === 1)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(5)
    })

    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        async function fn(_s: string): Promise<number> {
            return 3
        }

        const cachedFn = CacheAsyncFn(fn, DEFAULT_OPTS)
        const a: number = await cachedFn('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        await cachedFn()
        // @ts-expect-error too many args
        await cachedFn('abc', 3)
        // @ts-expect-error wrong argument type
        await cachedFn(3)

        // @ts-expect-error wrong return type
        const c: string = await cachedFn('abc')
        expect(c).toEqual(3)
        cachedFn.clearMatching((_d: string) => true)
        const cachedFn2 = CacheAsyncFn(fn, {
            ...DEFAULT_OPTS,
            cacheKey: ([s]) => {
                return s.length
            }
        })

        cachedFn2.clearMatching((_d: number) => true)
    })

    it('does memoize consecutive calls', async () => {
        let i = 0
        const fn = async () => {
            i += 1
            return i
        }
        const memoized = CacheAsyncFn(fn, DEFAULT_OPTS)
        const firstCall = memoized()
        const secondCall = memoized()

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

        const cachedFn = CacheAsyncFn(fn, {
            maxSize: 10000,
            maxAge: 1800000,
            cacheKey: ([v]) => {
                return v
            }
        })
        const task = Promise.all([
            cachedFn(taskId1),
            cachedFn(taskId2),
            cachedFn(taskId1),
            cachedFn(taskId2),
        ])
        task.catch(() => {})
        setImmediate(() => {
            cachedFn(taskId1)
            cachedFn(taskId1)
            cachedFn(taskId2)
            cachedFn(taskId2)
        })
        process.nextTick(() => {
            cachedFn(taskId1)
            cachedFn(taskId2)
            cachedFn(taskId1)
            cachedFn(taskId2)
        })
        setTimeout(() => {
            cachedFn(taskId1)
            cachedFn(taskId1)
            cachedFn(taskId2)
            cachedFn(taskId2)
        })
        await wait(10)
        cachedFn(taskId2)
        cachedFn(taskId2)
        cachedFn(taskId1)
        cachedFn(taskId1)
        await Promise.all([
            cachedFn(taskId1),
            cachedFn(taskId2),
            cachedFn(taskId1),
            cachedFn(taskId2),
        ])
        await task
        expect(fn).toHaveBeenCalledTimes(2)
        expect(calledWith).toEqual([taskId1, taskId2])
        await wait(200)
        expect(fn).toHaveBeenCalledTimes(2)
        expect(calledWith).toEqual([taskId1, taskId2])
    })
})
