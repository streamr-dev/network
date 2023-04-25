import { scheduleAtFixedRate } from '../src/scheduleAtFixedRate'
import { wait } from '../src/wait'

const INTERVAL = 100
const JITTER = 200

describe('scheduleAtFixedRate', () => {
    let task: jest.Mock<Promise<void>, [number]>
    let abortController: AbortController

    beforeEach(() => {
        task = jest.fn()
        abortController = new AbortController()
    })

    afterEach(() => {
        abortController?.abort()
    })

    it('repeats task every `interval`', async () => {
        scheduleAtFixedRate(task, INTERVAL, abortController.signal)
        await wait(4 * INTERVAL + JITTER)
        expect(task.mock.calls.length).toBeGreaterThanOrEqual(4)
        expect(task.mock.calls.every(([now]) => now % 100 === 0)).toEqual(true)
    })

    it('task never invoked if initially aborted', async () => {
        abortController.abort()
        scheduleAtFixedRate(task, INTERVAL, abortController.signal)
        await wait(4 * INTERVAL + JITTER)
        expect(task).not.toHaveBeenCalled()
    })
})
