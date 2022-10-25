import { listenOnceForAbort } from '../src/listenOnceForAbort'
import { AbortError } from '../src/asAbortable'
import { noop } from 'lodash'

describe(listenOnceForAbort, () => {
    it('triggers callback on abort signal', () => {
        const controller = new AbortController()
        const cb = jest.fn()
        listenOnceForAbort(controller.signal, cb)
        expect(cb).not.toHaveBeenCalled()
        controller.abort()
        expect(cb).toHaveBeenCalled()
    })

    it('does not trigger callback on abort signal if cleared', () => {
        const controller = new AbortController()
        const cb = jest.fn()
        const { clear } = listenOnceForAbort(controller.signal, cb)
        clear()
        controller.abort()
        expect(cb).not.toHaveBeenCalled()
    })

    it('by default triggers callback given pre-aborted signal', () => {
        const controller = new AbortController()
        controller.abort()
        const cb = jest.fn()
        listenOnceForAbort(controller.signal, cb)
        expect(cb).toHaveBeenCalled()
    })

    it('when given pre-aborted signal, returned clear is noop', () => {
        const controller = new AbortController()
        controller.abort()
        const cb = jest.fn()
        const { clear } = listenOnceForAbort(controller.signal, cb)
        expect(clear).toBe(noop)
    })

    it('can be configured to throw instead given pre-aborted signal', () => {
        const controller = new AbortController()
        controller.abort()
        const cb = jest.fn()
        expect(() => listenOnceForAbort(controller.signal, cb, 'throw'))
            .toThrowError(new AbortError())
        expect(cb).not.toHaveBeenCalled()
    })
})

