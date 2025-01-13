import { wait } from '@streamr/utils'
import { pLimitFn, pOnce, pOne } from '../../src/utils/promises'

const WAIT_TIME = 25

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
        const c: string = await limitedFn('abc')
        expect(c).toEqual(3)
        limitedFn.clear()
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
            if (isInProgress) {
                throw new Error('already in progress')
            }
            isInProgress = true
            await wait(WAIT_TIME)
            // eslint-disable-next-line require-atomic-updates
            isInProgress = false
        })

        const wrappedFn = pOnce(next)
        const tasks = [wrappedFn(), wrappedFn(), wrappedFn()]
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
        const tasks = [wrappedFn(), wrappedFn(), wrappedFn()]
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
        const tasks = [wrappedFn(), wrappedFn(), wrappedFn()]
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
        const tasks = [wrappedFn(), wrappedFn(), wrappedFn()]
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
        expect(await wrappedFn().then(() => wrappedFn())).toEqual(5)
    })
})
