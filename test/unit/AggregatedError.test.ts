import AggregatedError from '../../src/utils/AggregatedError'

describe('AggregatedError', () => {
    describe('new', () => {
        it('works without args', () => {
            const err = new AggregatedError()
            expect(err.message).toBe('')
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set())
        })

        it('can take subError', () => {
            const subError = new Error('test')
            const err = new AggregatedError([subError])
            expect(err.message).toContain(subError.message)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError]))
        })

        it('can take custom message', () => {
            const subError = new Error('test')
            const customMessage = 'customMessage'
            const err = new AggregatedError([subError], customMessage)
            expect(err.message).toContain(subError.message)
            expect(err.message).toContain(customMessage)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError]))
        })

        it('works without Errors', () => {
            const customMessage = 'customMessage'
            const err = new AggregatedError([], customMessage)
            expect(err.message).toContain(customMessage)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([]))
        })
    })

    describe('extend', () => {
        it('can extend from another error', () => {
            const subError1 = new Error('subError1')
            const subError2 = new Error('subError2')
            const err = new AggregatedError([subError1]).extend(subError2)
            expect(err.message).toContain(subError1.message)
            expect(err.message).toContain(subError2.message)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError1, subError2]))
        })

        it('can extend from another error and custom message', () => {
            const subError1 = new Error('subError1')
            const subError2 = new Error('subError2')
            const customMessage = 'customMessage'
            const err = new AggregatedError([subError1]).extend(subError2, customMessage)
            expect(err.message).toContain(subError1.message)
            expect(err.message).toContain(subError2.message)
            expect(err.message).toContain(customMessage)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError1, subError2]))
        })

        it('can extend from another error with custom message and own custom message', () => {
            const subError1 = new Error('subError1')
            const subError2 = new Error('subError2')
            const customMessage1 = 'customMessage1'
            const customMessage2 = 'customMessage2'
            const err = new AggregatedError([subError1], customMessage1).extend(subError2, customMessage2)
            expect(err.message).toContain(subError1.message)
            expect(err.message).toContain(subError2.message)
            expect(err.message).toContain(customMessage1)
            expect(err.message).toContain(customMessage2)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError1, subError2]))
        })
    })

    describe('from', () => {
        it('does nothing with only oldErr', () => {
            const subError = new Error('subError1')
            const err = AggregatedError.from(subError)
            expect(subError).toBe(err)
        })

        it('does nothing with only newErr', () => {
            const subError = new Error('subError1')
            const err = AggregatedError.from(undefined, subError)
            expect(subError).toBe(err)
        })

        it('can rejig message', () => {
            const subError = new Error('subError1')
            const customMessage = 'customMessage'
            const err = AggregatedError.from(undefined, subError, customMessage)
            expect(err && err.message).toContain(customMessage)
            expect(subError).toBe(err)
        })

        it('can extend from another Error with own custom message', () => {
            const subError1 = new Error('subError1')
            const subError2 = new Error('subError2')
            const customMessage1 = 'customMessage2'
            const err = AggregatedError.from(subError1, subError2, customMessage1) as AggregatedError
            expect(err.message).toContain(subError1.message)
            expect(err.message).toContain(subError2.message)
            expect(err.message).toContain(customMessage1)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError1, subError2]))
            expect(err).toBeInstanceOf(AggregatedError)
        })

        it('can extend from another AggregatedError with custom message and own custom message', () => {
            const subError1 = new Error('subError1')
            const subError2 = new Error('subError2')
            const customMessage1 = 'customMessage1'
            const customMessage2 = 'customMessage2'
            const originalErr = new AggregatedError([subError1], customMessage1)
            const err = AggregatedError.from(originalErr, subError2, customMessage2) as AggregatedError
            expect(err.message).toContain(subError1.message)
            expect(err.message).toContain(subError2.message)
            expect(err.message).toContain(customMessage1)
            expect(err.message).toContain(customMessage2)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError1, subError2]))
        })
    })

    describe('subclasses work', () => {
        class MyError extends AggregatedError {}
        it('does nothing with only oldErr', () => {
            const subError = new Error('subError1')
            const err = MyError.from(subError)
            expect(subError).toBe(err)
        })

        it('can extend from another error with custom message and own custom message', () => {
            const subError1 = new Error('subError1')
            const subError2 = new Error('subError2')
            const customMessage1 = 'customMessage1'
            const customMessage2 = 'customMessage2'
            const originalErr = new AggregatedError([subError1], customMessage1)
            const err = MyError.from(originalErr, subError2, customMessage2) as AggregatedError
            expect(err.message).toContain(subError1.message)
            expect(err.message).toContain(subError2.message)
            expect(err.message).toContain(customMessage1)
            expect(err.message).toContain(customMessage2)
            expect(err.stack).not.toBe('')
            expect(err.errors).toEqual(new Set([subError1, subError2]))
            expect(err).toBeInstanceOf(MyError)
        })
    })
})
