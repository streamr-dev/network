import { scheduleAtInterval } from '../src/scheduleAtInterval'
import { wait } from '../src/wait'

const INTERVAL = 50
const JITTER = INTERVAL * 2
const AT_LEAST_FIVE_REPEATS_TIME = INTERVAL * 5 + JITTER

describe('scheduleAtInterval', () => {
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
        await scheduleAtInterval(task, INTERVAL, true, abortController.signal)
        expect(task).toHaveBeenCalledTimes(1)
    })

    it('execute at start disabled', async () => {
        await scheduleAtInterval(task, INTERVAL, false, abortController.signal)
        expect(task).toHaveBeenCalledTimes(0)
    })

    it('repeats every `interval`', async () => {
        await scheduleAtInterval(task, INTERVAL, false, abortController.signal)
        await wait(AT_LEAST_FIVE_REPEATS_TIME)
        expect(task.mock.calls.length).toBeGreaterThanOrEqual(5)
    })

    it('there is no special handling for slow tasks', async () => {
        task.mockImplementation(() => wait(INTERVAL))
        await scheduleAtInterval(task, INTERVAL, false, abortController.signal)
        await wait(AT_LEAST_FIVE_REPEATS_TIME)
        expect(task.mock.calls.length).toBeLessThan(5)
    })

    it('task never invoked if initially aborted', async () => {
        abortController.abort()
        await scheduleAtInterval(task, INTERVAL, true, abortController.signal)
        await wait(AT_LEAST_FIVE_REPEATS_TIME)
        expect(task).not.toHaveBeenCalled()
    })
})
