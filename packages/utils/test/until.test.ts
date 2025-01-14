import { until } from '../src/until'

describe('until', () => {
    describe('given conditionFn that returns boolean primitives', () => {
        it('resolves immediately if conditionFn returns true from the get-go', (done) => {
            until(() => true)
                .then(done)
                .catch(() => done(new Error('timed out')))
        })

        it('resolves eventually when conditionFn returns true', (done) => {
            let cbReturnValue = false
            setTimeout(() => (cbReturnValue = true), 50)
            until(() => cbReturnValue, 5000, 10)
                .then(done)
                .catch(() => done(new Error('timed out')))
        })

        it('rejects if conditionFn does not return true within timeout', (done) => {
            const pollCb = () => false
            until(pollCb, 50, 5).catch((err) => {
                expect(err.message).toEqual('until: timed out before "() => false" became true')
                done()
            })
        })

        it('rejects if conditionFn does not return true before abort signalled', (done) => {
            const abortController = new AbortController()
            setTimeout(() => {
                abortController.abort()
            }, 100)
            until(() => false, 5000, 10, abortController.signal).catch((err) => {
                expect(err.message).toEqual('until: aborted before "() => false" became true')
                done()
            })
        })
    })

    describe('given conditionFn that returns promisified booleans (i.e. Promise<boolean>)', () => {
        it('resolves immediately if conditionFn returns (promisified) true from the get-go', async () => {
            const fn = jest.fn().mockResolvedValue(true)
            await until(fn)
            expect(fn).toHaveBeenCalledTimes(1)
        })

        it('resolves eventually when conditionFn returns (promisified) true', async () => {
            const fn = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
            await until(fn)
            expect(fn).toHaveBeenCalledTimes(2)
        })

        it('rejects if conditionFn keeps returning (promisified) false within timeout', async () => {
            const fn = () => Promise.resolve(false)
            await expect(until(fn, 50, 10)).rejects.toThrow(
                'until: timed out before "() => Promise.resolve(false)" became true'
            )
        })

        it('rejects immediately if conditionFn returns rejected promise from the get-go', async () => {
            const error = new Error('mock')
            await expect(until(() => Promise.reject(error))).rejects.toThrow(error)
        })

        it('rejects eventually if conditionFn returns rejected promise and no (promisifed) true was encountered', async () => {
            const error = new Error('mock')
            const fn = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(error)
            await expect(until(fn)).rejects.toThrow(error)
        })

        it('rejects if conditionFn returns promise that does not settle within timeout', async () => {
            await expect(until(() => new Promise(() => {}), 100, 10)).rejects.toThrow(
                'until: timed out before "() => new Promise(() => { })" became true'
            )
        })

        it('rejects if conditionFn does not return true before abort signalled', (done) => {
            const abortController = new AbortController()
            setTimeout(() => {
                abortController.abort()
            }, 100)
            until(() => Promise.resolve(false), 5000, 10, abortController.signal).catch((err) => {
                expect(err.message).toEqual('until: aborted before "() => Promise.resolve(false)" became true')
                done()
            })
        })
    })

    it('rejects immediately if given pre-aborted signal', (done) => {
        const abortController = new AbortController()
        abortController.abort()
        until(() => true, 5000, 1, abortController.signal).catch((err) => {
            expect(err.message).toEqual('until: aborted before "() => true" became true')
            done()
        })
    })

    it('can provide contextual information on rejection', (done) => {
        const pollCb = () => false
        until(pollCb, 50, 5, undefined, () => 'a was 5, expected 10').catch((err) => {
            expect(err.message).toEqual('until: timed out before "() => false" became true' + '\na was 5, expected 10')
            done()
        })
    })
})
