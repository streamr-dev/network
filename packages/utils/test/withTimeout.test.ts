import { TimeoutError, withTimeout } from '../src/withTimeout'
import { AbortError } from '../src/asAbortable'

describe('withTimeout', () => {
    it('resolves if given promise resolves before timeout', () => {
        return expect(withTimeout(new Promise((resolve) => setTimeout(() => resolve(123), 10)), 50)).resolves.toEqual(
            123
        )
    })

    it('rejects if given promise resolves after timeout', () => {
        return expect(withTimeout(new Promise((resolve) => setTimeout(() => resolve(123), 50)), 10)).rejects.toEqual(
            new TimeoutError(10)
        )
    })

    it('rejects with given promise if given promise rejects before timeout', () => {
        return expect(withTimeout(Promise.reject(new Error('foobar')), 50)).rejects.toEqual(new Error('foobar'))
    })

    it('rejection timeout can be given custom error context', () => {
        return expect(
            withTimeout(new Promise((resolve) => setTimeout(() => resolve(123), 50)), 10, 'no connection available')
        ).rejects.toEqual(new TimeoutError(10, 'no connection available'))
    })

    it('rejects if aborted during wait', () => {
        const abortController = new AbortController()
        setTimeout(() => {
            abortController.abort()
        }, 10)
        return expect(
            withTimeout(new Promise<unknown>(() => {}), 50, 'context', abortController.signal)
        ).rejects.toEqual(new AbortError('context'))
    })

    it('rejects if initially aborted', () => {
        const abortController = new AbortController()
        abortController.abort()
        return expect(
            withTimeout(new Promise<unknown>(() => {}), 10, 'context', abortController.signal)
        ).rejects.toEqual(new AbortError('context'))
    })

    it('timeout if no abort controller signalled', () => {
        const abortController = new AbortController()
        return expect(
            withTimeout(new Promise<unknown>(() => {}), 10, 'context', abortController.signal)
        ).rejects.toEqual(new TimeoutError(10, 'context'))
    })
})
