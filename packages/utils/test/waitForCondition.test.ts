import { waitForCondition } from '../src/waitForCondition'

describe('waitForCondition', () => {
    describe('given conditionFn that returns boolean primitives', () => {
        it('resolves immediately if conditionFn returns true from the get-go', (done) => {
            waitForCondition(() => true)
                .then(done)
                .catch(() => done(new Error('timed out')))
        })

        it('resolves eventually when conditionFn returns true', (done) => {
            let cbReturnValue = false
            setTimeout(() => cbReturnValue = true, 50)
            waitForCondition(() => cbReturnValue, 5000, 10)
                .then(done)
                .catch(() => done(new Error('timed out')))
        })

        it('rejects if conditionFn does not return true within timeout', (done) => {
            const pollCb = () => false
            waitForCondition(pollCb, 50, 5).catch((err) => {
                expect(err.message).toEqual("waitForCondition: timed out before \"() => false\" became true")
                done()
            })
        })

        it('rejects if conditionFn does not return true before abort signalled', (done) => {
            const abortController = new AbortController()
            setTimeout(() => {
                abortController.abort()
            }, 100)
            waitForCondition(() => false, 5000, 10, abortController.signal).catch((err) => {
                expect(err.message).toEqual("waitForCondition: aborted before \"() => false\" became true")
                done()
            })
        })

        it('rejects immediately if given pre-aborted signal', (done) => {
            const abortController = new AbortController()
            abortController.abort()
            waitForCondition(() => true, 5000, 1, abortController.signal).catch((err) => {
                expect(err.message).toEqual("waitForCondition: aborted before \"() => true\" became true")
                done()
            })
        })
    })

    describe('given conditionFn that returns promisified booleans (i.e. Promise<boolean>)', () => {
        it('resolves immediately if conditionFn returns (promisified) true from the get-go', async () => {
            const fn = jest.fn().mockResolvedValue(true)
            await waitForCondition(fn)
            expect(fn).toBeCalledTimes(1)
        })

        it('resolves eventually when conditionFn returns (promisified) true', async () => {
            const fn = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            await waitForCondition(fn)
            expect(fn).toBeCalledTimes(2)
        })

        it('rejects if conditionFn keeps returning (promisified) false within timeout', async () => {
            const fn = () => Promise.resolve(false)
            await expect(waitForCondition(fn, 50, 10)).rejects
                .toThrow("waitForCondition: timed out before \"() => Promise.resolve(false)\" became true")
        })

        it('rejects immediately if conditionFn returns rejected promise from the get-go', async () => {
            const error = new Error('mock')
            await expect(waitForCondition(() => Promise.reject(error))).rejects.toThrow(error)
        })

        it('rejects eventually if conditionFn returns rejected promise and no (promisifed) true was encountered', async () => {
            const error = new Error('mock')
            const fn = jest.fn()
                .mockResolvedValueOnce(false)
                .mockRejectedValueOnce(error)
            await expect(waitForCondition(fn))
                .rejects
                .toThrow(error)
        })

        it('rejects if conditionFn returns promise that does not settle within timeout', async () => {
            await expect(waitForCondition(() => new Promise(() => {}), 100, 10))
                .rejects
                .toThrow('waitForCondition: timed out before "() => new Promise(() => { })" became true')
        })

        it('rejects if conditionFn does not return true before abort signalled', (done) => {
            const abortController = new AbortController()
            setTimeout(() => {
                abortController.abort()
            }, 100)
            waitForCondition(() => Promise.resolve(false), 5000, 10, abortController.signal).catch((err) => {
                expect(err.message).toEqual("waitForCondition: aborted before \"() => Promise.resolve(false)\" became true")
                done()
            })
        })

        it('rejects immediately if given pre-aborted signal', (done) => {
            const abortController = new AbortController()
            abortController.abort()
            waitForCondition(() => Promise.resolve(true), 5000, 1, abortController.signal).catch((err) => {
                expect(err.message).toEqual("waitForCondition: aborted before \"() => Promise.resolve(true)\" became true")
                done()
            })
        })
    })

    it('can provide contextual information on rejection', (done) => {
        const pollCb = () => false
        waitForCondition(pollCb, 50, 5, undefined, () => "a was 5, expected 10").catch((err) => {
            expect(err.message).toEqual("waitForCondition: timed out before \"() => false\" became true" +
                "\na was 5, expected 10")
            done()
        })
    })
})
