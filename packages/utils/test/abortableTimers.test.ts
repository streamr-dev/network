import { setAbortableInterval, setAbortableTimeout } from '../src/abortableTimers'
import { wait } from '../src/wait'

const TIMEOUT_UNIT = 100
const INTERVAL_UNIT = 50

describe('setAbortableTimeout',  () => {
    it('invokes callback once if not aborted', async () => {
        const cb = jest.fn()
        setAbortableTimeout(cb, TIMEOUT_UNIT)
        await wait(TIMEOUT_UNIT / 2)
        expect(cb).toHaveBeenCalledTimes(0)
        await wait(TIMEOUT_UNIT)
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
    let ref: NodeJS.Timer

    afterEach(() => {
        clearTimeout(ref)
    })

    it('repeatedly invokes callback if not aborted', async () => {
        const cb = jest.fn()
        ref = setAbortableInterval(cb, INTERVAL_UNIT)
        await wait(INTERVAL_UNIT / 4)
        expect(cb).toHaveBeenCalledTimes(0)
        await wait(INTERVAL_UNIT * 4 + INTERVAL_UNIT / 2)
        expect(cb).toHaveBeenCalledTimes(4)
    })

    it('stops invoking callback if aborted', async () => {
        const abortController = new AbortController()
        const cb = jest.fn()
        ref = setAbortableInterval(cb, INTERVAL_UNIT, abortController.signal)
        await wait(INTERVAL_UNIT)
        abortController.abort()
        const callsBeforeAbort = cb.mock.calls.length
        await wait(INTERVAL_UNIT * 4)
        expect(cb.mock.calls.length).toEqual(callsBeforeAbort)
    })

    it('does not invoke callback if initially aborted', async () => {
        const abortController = new AbortController()
        abortController.abort()
        const cb = jest.fn()
        ref = setAbortableInterval(cb, INTERVAL_UNIT, abortController.signal)
        await wait(INTERVAL_UNIT * 4)
        expect(cb).not.toHaveBeenCalled()
    })
})
