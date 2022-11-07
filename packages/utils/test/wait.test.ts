import { wait } from '../src/wait'
import { AbortError } from '../src/asAbortable'

describe('wait', () => {
    // https://stackoverflow.com/questions/21097421/what-is-the-reason-javascript-settimeout-is-so-inaccurate
    const JITTER_FACTOR = 4

    it('waits at least the predetermined time', async () => {
        const start = Date.now()
        await wait(20)
        const end = Date.now()
        expect(end - start).toBeGreaterThanOrEqual(20 - JITTER_FACTOR)
    })

    it('rejects if aborted during wait', () => {
        const abortController = new AbortController()
        setTimeout(() => {
            abortController.abort()
        }, 10)
        return expect(wait(20, abortController.signal)).rejects.toEqual(new AbortError())
    })

    it('rejects if initially aborted', () => {
        const abortController = new AbortController()
        abortController.abort()
        return expect(wait(20, abortController.signal)).rejects.toEqual(new AbortError())
    })
})
