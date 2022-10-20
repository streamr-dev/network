import { TimeoutError, withTimeout } from '../src/withTimeout'
import { AbortError } from '../src/AbortError'

describe(withTimeout, () => {
    it('resolves if given promise resolves before timeout', () => {
        return expect(withTimeout(new Promise((resolve) => setTimeout(() => resolve(123), 10)), 20))
            .resolves.toEqual(123)
    })

    it('rejects if given promise resolves after timeout', () => {
        return expect(withTimeout(new Promise((resolve) => setTimeout(() => resolve(123), 20)), 10))
            .rejects.toEqual(new TimeoutError(10))
    })

    it('rejects with given promise if given promise rejects before timeout', () => {
        return expect(withTimeout(Promise.reject(new Error('foobar')), 20))
            .rejects.toEqual(new Error('foobar'))
    })

    it('rejection timeout can be given custom error context', () => {
        return expect(
            withTimeout(
                new Promise((resolve) => setTimeout(() => resolve(123), 20)),
                10,
                'no connection available'
            )
        ).rejects.toEqual(new TimeoutError(10, 'no connection available'))
    })

    it('rejects if aborted during wait', () => {
        const abortController = new AbortController()
        setTimeout(() => {
            abortController.abort()
        }, 10)
        return expect(withTimeout(new Promise<unknown>(() => {}), 20, 'context', abortController))
            .rejects.toEqual(new AbortError('context'))
    })

    it('rejects if initially aborted', () => {
        const abortController = new AbortController()
        abortController.abort()
        return expect(withTimeout(new Promise<unknown>(() => {}), 20, 'context', abortController))
            .rejects.toEqual(new AbortError('context'))
    })

    it('timeout if no abort controller signalled', () => {
        const abortController = new AbortController()
        return expect(withTimeout(new Promise<unknown>(() => {}), 10, 'context', abortController))
            .rejects.toEqual(new TimeoutError(10, 'context'))
    })
})
