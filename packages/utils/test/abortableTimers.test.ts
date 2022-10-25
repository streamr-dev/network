import { setAbortableInterval, setAbortableTimeout } from '../src/abortableTimers'
import { wait } from '../src/wait'

const TIMEOUT_UNIT = 100
const INTERVAL_UNIT = 50

describe('setAbortableTimeout',  () => {
    it('invokes callback once if not aborted', async () => {
        const cb = jest.fn()
        setAbortableTimeout(cb, TIMEOUT_UNIT, new AbortController().signal)
        await wait(TIMEOUT_UNIT / 2)
        expect(cb).toHaveBeenCalledTimes(0)
        await wait(TIMEOUT_UNIT + 20)
        expect(cb).toHaveBeenCalledTimes(1)
    })

    it('does not invoke callback if aborted', async () => {
        const abortController = new AbortController()
        const cb = jest.fn()
        setAbortableTimeout(cb, TIMEOUT_UNIT, abortController.signal)
        await wait(TIMEOUT_UNIT / 2)
        abortController.abort()
        await wait(TIMEOUT_UNIT + 20)
        expect(cb).not.toHaveBeenCalled()
    })

    it('does not invoke callback if initially aborted', async () => {
        const abortController = new AbortController()
        abortController.abort()
        const cb = jest.fn()
        setAbortableTimeout(cb, TIMEOUT_UNIT, abortController.signal)
        await wait(TIMEOUT_UNIT + 20)
        expect(cb).not.toHaveBeenCalled()
    })
})

describe('setAbortableInterval',  () => {
    let defaultTestAbortController: AbortController

    beforeEach(() => {
        defaultTestAbortController = new AbortController()
    })

    afterEach(() => {
        defaultTestAbortController.abort()
    })

    it('repeatedly invokes callback if not aborted', async () => {
        const cb = jest.fn()
        setAbortableInterval(cb, INTERVAL_UNIT, defaultTestAbortController.signal)
        await wait(INTERVAL_UNIT / 4)
        expect(cb).toHaveBeenCalledTimes(0)
        await wait(INTERVAL_UNIT * 4 + INTERVAL_UNIT / 2)
        expect(cb).toHaveBeenCalledTimes(4)
    })

    it('stops invoking callback if aborted', async () => {
        const abortController = new AbortController()
        const cb = jest.fn()
        setAbortableInterval(cb, INTERVAL_UNIT, abortController.signal)
        await wait(INTERVAL_UNIT)
        const callsBeforeAbort = cb.mock.calls.length
        abortController.abort()
        await wait(INTERVAL_UNIT * 4)
        expect(cb.mock.calls.length).toEqual(callsBeforeAbort)
    })

    it('does not invoke callback if initially aborted', async () => {
        const abortController = new AbortController()
        abortController.abort()
        const cb = jest.fn()
        setAbortableInterval(cb, INTERVAL_UNIT, abortController.signal)
        await wait(INTERVAL_UNIT * 4)
        expect(cb).not.toHaveBeenCalled()
    })
})
