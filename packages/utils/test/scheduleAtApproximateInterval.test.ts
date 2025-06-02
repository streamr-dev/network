import { scheduleAtApproximateInterval } from '../src/scheduleAtApproximateInterval'
import { wait } from '../src/wait'

const INTERVAL = 50
const JITTER = INTERVAL * 2
const DRIFT_MULTIPLIER = 0.1
const AT_LEAST_FIVE_REPEATS_TIME = INTERVAL * 5 + JITTER

describe('scheduleAtApproximateInterval', () => {
    let task: jest.Mock<Promise<void>, []>
    let abortController: AbortController

    beforeEach(() => {
        task = jest.fn()
        abortController = new AbortController()
    })

    afterEach(() => {
        abortController.abort()
    })

    it('execute at start enabled', async () => {
        await scheduleAtApproximateInterval(task, INTERVAL, DRIFT_MULTIPLIER, true, abortController.signal)
        expect(task).toHaveBeenCalledTimes(1)
    })

    it('execute at start disabled', async () => {
        await scheduleAtApproximateInterval(task, INTERVAL, DRIFT_MULTIPLIER, false, abortController.signal)
        expect(task).toHaveBeenCalledTimes(0)
    })

    it('repeats every `interval`', async () => {
        await scheduleAtApproximateInterval(task, INTERVAL, DRIFT_MULTIPLIER, false, abortController.signal)
        await wait(AT_LEAST_FIVE_REPEATS_TIME * (1 + DRIFT_MULTIPLIER))
        expect(task.mock.calls.length).toBeGreaterThanOrEqual(5)
    })

    it('does not take into account the time for the promise to settle', async () => {
        task.mockImplementation(() => wait(INTERVAL))
        await scheduleAtApproximateInterval(task, INTERVAL, DRIFT_MULTIPLIER, false, abortController.signal)
        await wait(AT_LEAST_FIVE_REPEATS_TIME * (1 + DRIFT_MULTIPLIER))
        expect(task.mock.calls.length).toBeLessThan(5)
    })

    it('task never invoked if initially aborted', async () => {
        abortController.abort()
        await scheduleAtApproximateInterval(task, INTERVAL, DRIFT_MULTIPLIER, true, abortController.signal)
        await wait(AT_LEAST_FIVE_REPEATS_TIME * (1 + DRIFT_MULTIPLIER))
        expect(task).not.toHaveBeenCalled()
    })
})
