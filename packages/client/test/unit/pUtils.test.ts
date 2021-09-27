import { wait } from 'streamr-test-utils'

import { pOrderedResolve, CacheAsyncFn, CacheFn, pOnce, pLimitFn, pOne } from '../../src/utils'

const WAIT_TIME = 25

describe('pOrderedResolve', () => {
    it('Execute functions concurrently, resolving in order they were executed', async () => {
        let count = 0
        let active = 0
        const orderedFn = pOrderedResolve(async (index) => {
            try {
                active += 1
                if (index === 1) {
                    await wait(WAIT_TIME) // delay first call
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

    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        async function fn(_s: string): Promise<number> {
            return 3
        }

        const orderedFn = pOrderedResolve(fn)
        const a: number = await orderedFn('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        await orderedFn()
        // @ts-expect-error too many args
        await orderedFn('abc', 3)
        // @ts-expect-error wrong argument type
        await orderedFn(3)

        // @ts-expect-error wrong return type
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const c: string = await orderedFn('abc')
        expect(c).toEqual(3)
        orderedFn.clear()
    })
})

describe('pLimitFn', () => {
    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        async function fn(_s: string): Promise<number> {
            return 3
        }

        const limitedFn = pLimitFn(fn)
        const a: number = await limitedFn('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        await limitedFn()
        // @ts-expect-error too many args
        await limitedFn('abc', 3)
        // @ts-expect-error wrong argument type
        await limitedFn(3)

        // @ts-expect-error wrong return type
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const c: string = await limitedFn('abc')
        expect(c).toEqual(3)
        limitedFn.clear()
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

    it('does memoize consecutive calls', async () => {
        let i = 0
        const fn = async () => {
            i += 1
            return i
        }
        const memoized = CacheAsyncFn(fn)
        const firstCall = memoized()
        const secondCall = memoized()

        expect(await Promise.all([firstCall, secondCall])).toEqual([1, 1])
        //expect(fn).toHaveBeenCalledTimes(1)
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

describe('cacheFn', () => {
    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        function fn(_s: string): number {
            return 3
        }

        const cachedFn = CacheFn(fn)
        const a: number = cachedFn('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        cachedFn()
        // @ts-expect-error too many args
        cachedFn('abc', 3)
        // @ts-expect-error wrong argument type
        cachedFn(3)

        // @ts-expect-error wrong return type
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const c: string = cachedFn('abc')
        expect(c).toEqual(3)
        const d = cachedFn.clear()
        expect(d).toBe(undefined)
        cachedFn.clearMatching((_d: string) => true)
        // @ts-expect-error wrong match argument type
        cachedFn.clearMatching((_d: number) => true)
        const cachedFn2 = CacheFn(fn, {
            cacheKey: ([s]) => {
                return s.length
            }
        })

        cachedFn2.clearMatching((_d: number) => true)
        // @ts-expect-error wrong match argument type
        cachedFn2.clearMatching((_d: string) => true)
    })
})

describe('pOnce', () => {
    it('works', async () => {
        let count = 0
        const next = jest.fn(async () => {
            count += 1
            return count
        })
        const wrappedFn = pOnce(next)
        expect(await wrappedFn()).toEqual(1)
        expect(await wrappedFn()).toEqual(1)
        expect(await wrappedFn()).toEqual(1)
        expect(await next()).toEqual(2)
        expect(await wrappedFn()).toEqual(1)
        expect(next).toHaveBeenCalledTimes(2)
    })

    it('calls function immediately', async () => {
        let count = 0
        const next = jest.fn(async () => {
            count += 1
            return count
        })
        const wrappedFn = pOnce(next)
        const task = wrappedFn()
        expect(await next()).toEqual(2)
        expect(await task).toEqual(1)
        expect(next).toHaveBeenCalledTimes(2)
    })

    it('works with concurrent starts', async () => {
        let isInProgress = false
        const next = jest.fn(async () => {
            if (isInProgress) { throw new Error('already in progress') }
            isInProgress = true
            await wait(WAIT_TIME)
            // eslint-disable-next-line require-atomic-updates
            isInProgress = false
        })

        const wrappedFn = pOnce(next)
        const tasks = [
            wrappedFn(),
            wrappedFn(),
            wrappedFn(),
        ]
        expect(isInProgress).toBe(true) // ensure fn was executed in same tick
        await Promise.all(tasks)
        expect(isInProgress).toBe(false)
        const t = wrappedFn()
        expect(isInProgress).toBe(false)
        await t
        expect(isInProgress).toBe(false)
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('works with reset', async () => {
        let count = 0
        const next = jest.fn(async (waitTime = WAIT_TIME) => {
            count += 1
            const value = count
            await wait(waitTime)
            return value
        })

        const wrappedFn = pOnce(next)
        const tasks = [
            wrappedFn(),
            wrappedFn(),
            wrappedFn(),
        ]
        expect(await Promise.all(tasks)).toEqual([1, 1, 1])
        wrappedFn.reset()
        const task1 = wrappedFn(WAIT_TIME)
        wrappedFn.reset()
        const task2 = wrappedFn(WAIT_TIME / 2) // this will resolve before task1
        const task3 = wrappedFn()
        expect(await Promise.all([task1, task2, task3])).toEqual([2, 3, 3])
        expect(await wrappedFn()).toBe(3)
        expect(next).toHaveBeenCalledTimes(3)
    })

    it('works with error', async () => {
        const err = new Error('expected')
        const next = jest.fn(async () => {
            await wait(WAIT_TIME)
            throw err
        })

        const wrappedFn = pOnce(next)
        const tasks = [
            wrappedFn(),
            wrappedFn(),
            wrappedFn(),
        ]
        await expect(async () => {
            await Promise.all(tasks)
        }).rejects.toThrow(err)
        await expect(async () => {
            await wrappedFn()
        }).rejects.toThrow(err)
        expect(next).toHaveBeenCalledTimes(1)
        // reset should work after rejection
        wrappedFn.reset()
        await expect(async () => {
            await wrappedFn()
        }).rejects.toThrow(err)
        expect(next).toHaveBeenCalledTimes(2)
    })

    it('can capture sync errors as async rejections', async () => {
        const err = new Error('expected')
        const next = jest.fn(() => {
            throw err
        })

        const wrappedFn = pOnce(next)
        const tasks = [
            wrappedFn(),
            wrappedFn(),
            wrappedFn(),
        ]
        await expect(async () => {
            await Promise.all(tasks)
        }).rejects.toThrow(err)
        await expect(async () => {
            await wrappedFn()
        }).rejects.toThrow(err)
        await wrappedFn().catch((error) => {
            expect(error).toBe(err)
        })
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('adopts type of wrapped function', async () => {
        // actually checking via ts-expect-error
        // assertions don't matter,
        async function fn(_s: string): Promise<number> {
            return 3
        }

        const wrappedFn = pOnce(fn)
        const a: number = await wrappedFn('abc') // ok
        expect(a).toEqual(3)
        // @ts-expect-error not enough args
        await wrappedFn()
        // @ts-expect-error too many args
        await wrappedFn('abc', 3)
        // @ts-expect-error wrong argument type
        await wrappedFn(3)

        // @ts-expect-error wrong return type
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const c: string = await wrappedFn('abc')
        expect(c).toEqual(3)
    })
})

describe('pOne', () => {
    it('works', async () => {
        let count = 0
        const next = jest.fn(async () => {
            count += 1
            const value = count
            await wait(WAIT_TIME)
            return value
        })
        const wrappedFn = pOne(next)

        // sequential calls should call next each time
        expect(await wrappedFn()).toEqual(1)
        expect(await wrappedFn()).toEqual(2)
        // parallel calls should be same
        expect(await Promise.all([wrappedFn(), wrappedFn(), wrappedFn()])).toEqual([3, 3, 3])
        // can call again immediately after resolved
        expect(await (wrappedFn().then(() => wrappedFn()))).toEqual(5)
    })
})
