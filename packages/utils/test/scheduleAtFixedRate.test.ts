import { scheduleAtFixedRate } from '../src/scheduleAtFixedRate'
import { wait } from '../src/wait'

const INTERVAL = 100

describe(scheduleAtFixedRate, () => {
    let task: jest.Mock<Promise<void>, [number]>
    let ref: { stop: () => void }

    beforeEach(() => {
        task = jest.fn()
    })

    afterEach(() => {
        ref.stop()
    })

    it('repeats every `interval`', async () => {
        ref = scheduleAtFixedRate(task, INTERVAL)
        await wait(4 * INTERVAL)
        expect(task.mock.calls.length).toBeGreaterThanOrEqual(4)
        expect(task.mock.calls.every(([now]) => now % 100 === 0)).toEqual(true)
    })
})
