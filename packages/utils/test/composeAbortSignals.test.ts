import { ComposedAbortSignal, composeAbortSignals } from '../src/composeAbortSignals'
import range from 'lodash/range'

describe('composeAbortSignals', () => {
    let controllers: AbortController[]
    let composedSignal: ComposedAbortSignal

    describe('given zero pre-aborted signals', () => {
        beforeEach(() => {
            controllers = range(10).map(() => new AbortController())
            composedSignal = composeAbortSignals(...controllers.map((c) => c.signal))
        })

        it('initial state is aborted=false', () => {
            expect(composedSignal.aborted).toBeFalse()
        })

        it('transitions to aborted=true when a signal aborts', () => {
            controllers[4].abort()
            expect(composedSignal.aborted).toBeTrue()
        })

        it('event "abort" is emitted when a signal aborts', () => {
            const listener = jest.fn()
            composedSignal.addEventListener('abort', listener)

            expect(listener).toHaveBeenCalledTimes(0)
            controllers[6].abort()
            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0][0].type).toEqual('abort')
        })

        it('event "abort" is emitted max once', () => {
            const listener = jest.fn()
            composedSignal.addEventListener('abort', listener)
            controllers[3].abort()
            controllers[6].abort()
            expect(listener).toHaveBeenCalledTimes(1)
        })

        it('event "abort" is not emitted after destroy', () => {
            const listener = jest.fn()
            composedSignal.addEventListener('abort', listener)
            composedSignal.destroy()
            controllers[6].abort()
            expect(listener).toHaveBeenCalledTimes(0)
        })

        it('onabort if set is invoked when a signal aborts', () => {
            const listener = jest.fn()
            ;(composedSignal as any).onabort = listener // type cast needed since @types/node missing onabort

            expect(listener).toHaveBeenCalledTimes(0)
            controllers[6].abort()
            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0][0].type).toEqual('abort')
        })

        it('onabort is invoked max once', () => {
            const listener = jest.fn()
            ;(composedSignal as any).onabort = listener // type cast needed since @types/node missing onabort
            controllers[3].abort()
            controllers[6].abort()
            expect(listener).toHaveBeenCalledTimes(1)
        })
    })

    describe('given at least one pre-aborted signal', () => {
        beforeEach(() => {
            controllers = range(10).map(() => new AbortController())
            controllers[8].abort()
            composedSignal = composeAbortSignals(...controllers.map((c) => c.signal))
        })

        it('initial state is aborted=true', () => {
            expect(composedSignal.aborted).toBeTrue()
        })

        it('another signal aborting has no impact on state', () => {
            controllers[6].abort()
            expect(composedSignal.aborted).toBeTrue()
        })

        it('another signal aborting does not emit "abort" event', () => {
            const listener = jest.fn()
            composedSignal.addEventListener('abort', listener)

            expect(listener).toHaveBeenCalledTimes(0)
            controllers[0].abort()
            expect(listener).toHaveBeenCalledTimes(0)
        })

        it('another signal aborting does not cause onabort to be invoked', () => {
            const listener = jest.fn()
            ;(composedSignal as any).onabort = listener // type cast needed since @types/node missing onabort

            expect(listener).toHaveBeenCalledTimes(0)
            controllers[0].abort()
            expect(listener).toHaveBeenCalledTimes(0)
        })
    })

    it('gives a pending signal for an empty list of signals', () => {
        expect(composeAbortSignals().aborted).toBeFalse()
    })

    it('works with "fetch"', async () => {
        const controller = new AbortController()
        const composedSignal = composeAbortSignals(controller.signal)
        const response = fetch(`https://www.google.com`, { signal: composedSignal })
        controller.abort()
        return expect(response).rejects.toThrow(/aborted/)
    })
})
