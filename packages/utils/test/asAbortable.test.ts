import { AbortError, asAbortable } from '../src/asAbortable'

const sleep = (ms: number) => new Promise<string>((resolve) => setTimeout(() => resolve('foobar'), ms))

const TIME_UNIT = 50

describe('asAbortable', () => {
    it('works without abortController', async () => {
        const actual = await asAbortable(sleep(TIME_UNIT))
        expect(actual).toEqual('foobar')
    })

    it('resolves if no abort controller signalled', async () => {
        const actual = await asAbortable(sleep(TIME_UNIT), new AbortController().signal)
        expect(actual).toEqual('foobar')
    })

    it('rejects if abort controller signalled before given promise resolves', async () => {
        const abortController = new AbortController()
        setTimeout(() => {
            abortController.abort()
        }, TIME_UNIT)
        const actual = asAbortable(sleep(2 * TIME_UNIT), abortController.signal, 'customError')
        return expect(actual).rejects.toEqual(new AbortError('customError'))
    })

    it('resolves if abort controller signalled after given promise resolved', async () => {
        const abortController = new AbortController()
        setTimeout(() => {
            abortController.abort()
        }, 2 * TIME_UNIT)
        const actual = await asAbortable(sleep(TIME_UNIT), abortController.signal)
        expect(actual).toEqual('foobar')
    })

    it('rejects if given pre-aborted controller', () => {
        const abortController = new AbortController()
        abortController.abort()
        const actual = asAbortable(sleep(TIME_UNIT), abortController.signal, 'customError')
        return expect(actual).rejects.toEqual(new AbortError('customError'))
    })
})
