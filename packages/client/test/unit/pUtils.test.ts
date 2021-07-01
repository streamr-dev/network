import { wait } from 'streamr-test-utils'

import { pOrderedResolve, CacheAsyncFn } from '../../src/utils'

describe('pOrderedResolve', () => {
    it('Execute functions concurrently, resolving in order they were executed', async () => {
        let count = 0
        let active = 0
        const orderedFn = pOrderedResolve(async (index) => {
            try {
                active += 1
                if (index === 1) {
                    await wait(50) // delay first call
                } else {
                    expect(active).toBeGreaterThan(1) // ensure concurrent
                    await wait(1)
                }
                return index
            } finally {
                active -= 1 // eslint-disable-line require-atomic-updates
            }
        })

        const results: any[] = []
        const fn = async () => {
            count += 1
            const v = await orderedFn(count)
            results.push(v)
            return v
        }

        await Promise.all([fn(), fn(), fn()])

        expect(results).toEqual([1, 2, 3])

        expect(active).toBe(0)
    })
})

describe('CacheAsyncFn', () => {
    it('caches & be cleared', async () => {
        const fn = jest.fn()
        const cachedFn = CacheAsyncFn(fn)
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
        cachedFn.clear()
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(4)
        await cachedFn(2)
        expect(fn).toHaveBeenCalledTimes(5)
        cachedFn.clearMatching((v) => v === 1)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(6)
        cachedFn.clearMatching((v) => v === 1)
        await cachedFn(1)
        expect(fn).toHaveBeenCalledTimes(7)
    })

    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        async function fn(_s: string): Promise<number> {
            return 3
        }

        const cachedFn = CacheAsyncFn(fn)
        const a: number = await cachedFn('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        await cachedFn()
        // @ts-expect-error too many args
        await cachedFn('abc', 3)
        // @ts-expect-error wrong argument type
        await cachedFn(3)

        // @ts-expect-error wrong return type
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const c: string = await cachedFn('abc')
        expect(c).toEqual(3)
        const d = cachedFn.clear()
        expect(d).toBe(undefined)
        cachedFn.clearMatching((_d: string) => true)
        // @ts-expect-error wrong match argument type
        cachedFn.clearMatching((_d: number) => true)
        const cachedFn2 = CacheAsyncFn(fn, {
            cacheKey: ([s]) => {
                return s.length
            }
        })

        cachedFn2.clearMatching((_d: number) => true)
        // @ts-expect-error wrong match argument type
        cachedFn2.clearMatching((_d: string) => true)
    })
})
