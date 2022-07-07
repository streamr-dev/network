import { scheduleAtInterval } from '../src/scheduleAtInterval'
import { wait } from '../src/wait'

const INTERVAL = 40
const FIVE_REPEATS_TIME = INTERVAL * 5 + INTERVAL/2

describe(scheduleAtInterval, () => {
    let task: jest.Mock<Promise<void>, []>
    let ref: { stop: () => void }

    beforeEach(() => {
        task = jest.fn()
    })

    afterEach(() => {
        ref.stop()
    })

    it('execute at start enabled', async () => {
        ref = await scheduleAtInterval(task, INTERVAL, true)
        expect(task).toHaveBeenCalledTimes(1)
    })

    it('execute at start disabled', async () => {
        ref = await scheduleAtInterval(task, INTERVAL, false)
        expect(task).toHaveBeenCalledTimes(0)
    })

    it('repeats every `interval`', async () => {
        ref = await scheduleAtInterval(task, INTERVAL, false)
        await wait(FIVE_REPEATS_TIME)
        expect(task.mock.calls.length).toEqual(5)
    })

    it('does not take into account the time for the promise to settle', async () => {
        task.mockImplementation(() => wait(INTERVAL))
        ref = await scheduleAtInterval(task, INTERVAL, false)
        await wait(FIVE_REPEATS_TIME)
        expect(task.mock.calls.length).toBeLessThan(5)
    })
})
