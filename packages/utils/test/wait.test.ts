import { wait } from '../src/wait'

describe(wait, () => {
    // https://stackoverflow.com/questions/21097421/what-is-the-reason-javascript-settimeout-is-so-inaccurate
    const JITTER_FACTOR = 4

    it("waits at least the predetermined time", async () => {
        const start = Date.now()
        await wait(20)
        const end = Date.now()
        expect(end - start).toBeGreaterThanOrEqual(20 - JITTER_FACTOR)
    })
})
