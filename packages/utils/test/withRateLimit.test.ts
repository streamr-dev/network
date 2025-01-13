import { withRateLimit } from '../src/withRateLimit'
import { wait } from '../src/wait'

describe('withRateLimit', () => {
    let fn: jest.Mock<Promise<void>, []>

    beforeEach(() => {
        fn = jest.fn()
    })

    it('first invocation always goes thru', async () => {
        const rateLimitFn = withRateLimit(fn, 1000)
        await rateLimitFn()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('only first invocation within interval goes thru', async () => {
        const rateLimitFn = withRateLimit(fn, 1000)
        await rateLimitFn()
        await rateLimitFn()
        await rateLimitFn()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('invocations spanning multiple intervals', async () => {
        const JITTER_FACTOR = 10
        const INTERVAL = 100
        const rateLimitFn = withRateLimit(fn, INTERVAL)
        await rateLimitFn() // +1
        await rateLimitFn()
        await wait(INTERVAL + JITTER_FACTOR)
        await rateLimitFn() // +1
        await rateLimitFn()
        await rateLimitFn()
        await wait(INTERVAL + JITTER_FACTOR)
        await rateLimitFn() // +1
        expect(fn).toHaveBeenCalledTimes(3)
    })
})
