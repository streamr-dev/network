import { TimeoutError, withTimeout } from '../src/withTimeout'

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
})
