import { Readable } from 'stream'

import { endStream, iteratorFinally, StreamIterator, CancelableIterator, pipeline, AbortError } from '../../src/iterators'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const expected = [1, 2, 3]

async function* generate(items = expected) {
    await wait(5)
    for await (const item of items) {
        await wait(5)
        yield item
        await wait(5)
    }
    await wait(5)
}

const WAIT = 50

describe('Iterator Utils', () => {
    describe('iteratorFinally', () => {
        let onFinally
        let onFinallyAfter
        const MAX_ITEMS = 2

        beforeEach(() => {
            onFinallyAfter = jest.fn()
            onFinally = jest.fn(async () => {
                await wait(WAIT)
                onFinallyAfter()
            })
        })

        afterEach(() => {
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
        })

        it('runs fn when iterator complete', async () => {
            const received = []
            for await (const msg of iteratorFinally(generate(), onFinally)) {
                received.push(msg)
            }
            expect(received).toEqual(expected)
        })

        it('runs fn when iterator returns during iteration', async () => {
            const received = []
            for await (const msg of iteratorFinally(generate(), onFinally)) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    return
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('runs fn when iterator throws during iteration', async () => {
            const received = []
            const err = new Error('expected err')
            await expect(async () => {
                for await (const msg of iteratorFinally(generate(), onFinally)) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('runs fn when iterator returns + throws during iteration', async () => {
            const received = []
            const err = new Error('expected err')
            const it = iteratorFinally(generate(), onFinally)
            await expect(async () => {
                for await (const msg of it) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        it.return()
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('runs fn when iterator returns before iteration', async () => {
            const received = []
            const it = iteratorFinally(generate(), onFinally)
            await it.return()
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            for await (const msg of it) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('runs fn when iterator throws before iteration', async () => {
            const received = []
            const err = new Error('expected err')
            const it = iteratorFinally(generate(), onFinally)
            await expect(async () => it.throw(err)).rejects.toThrow(err)
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            // doesn't throw, matches native iterators
            for await (const msg of it) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('runs fn once', async () => {
            const received = []
            const it = iteratorFinally(generate(), onFinally)

            for await (const msg of it) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    await Promise.all([
                        it.return(),
                        it.return(),
                    ])
                    return
                }
            }
            expect(received).toEqual([])
        })
    })
})

