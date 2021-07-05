import { wait } from 'streamr-test-utils'
import { PushBuffer, pull } from '../../src/utils/PushBuffer'

import IteratorTest, { expected } from './IteratorTest'

import { counterId } from '../../src/utils'

const WAIT = 20

async function* generate(items = expected, waitTime = WAIT) {
    await wait(waitTime * 0.1)
    for await (const item of items) {
        await wait(waitTime * 0.1)
        yield item
        await wait(waitTime * 0.1)
    }
    await wait(waitTime * 0.1)
}

describe('PushBuffer', () => {
    IteratorTest('PushBuffer', () => {
        const pushBuffer = new PushBuffer()
        pull(generate(), pushBuffer)
        return pushBuffer
    })

    describe('basics', () => {
        it('blocks push when buffer full', async () => {
            const pushBuffer = new PushBuffer(3)
            expect(await pushBuffer.push(expected[0])).toBe(true)
            expect(await pushBuffer.push(expected[1])).toBe(true)
            const pushResolved1 = jest.fn((v) => v)

            const task1 = pushBuffer.push(expected[2]).then(pushResolved1)
            expect(pushResolved1).toHaveBeenCalledTimes(0)
            await wait(10)
            expect(pushResolved1).toHaveBeenCalledTimes(0)
            expect(await pushBuffer.next()).toEqual({ value: expected[0], done: false })
            // need to wait for next turn of event loop
            await wait(0)
            expect(pushResolved1).toHaveBeenCalledTimes(1)
            expect(await pushBuffer.next()).toEqual({ value: expected[1], done: false })
            expect(await pushBuffer.next()).toEqual({ value: expected[2], done: false })
            expect(await task1).toBe(true)
            pushBuffer.end()
        })

        it('push resolves false if ended', async () => {
            const pushBuffer = new PushBuffer(3)
            expect(await pushBuffer.push(expected[0])).toBe(true)
            pushBuffer.end()
            expect(await pushBuffer.push(expected[1])).toBe(false)
        })

        it('push resolves false if errored', async () => {
            const err = new Error(counterId('expected error'))
            const pushBuffer = new PushBuffer(3)
            expect(await pushBuffer.push(expected[0])).toBe(true)
            expect(await pushBuffer.push(expected[1])).toBe(true)
            const pushTask = pushBuffer.push(expected[2]) // this should block then resolve false on pushBuffer throw
            // 3 items buffered, last push call pending
            const nextTask1 = pushBuffer.next()
            const nextTask2 = pushBuffer.next()
            // first two next calls should succeed
            const throwTask = pushBuffer.throw(err)
            // this next call is after throw, so should fail
            const nextTask3 = pushBuffer.next()
            await expect(throwTask).rejects.toThrow(err)
            expect(await pushTask).toBe(false)
            expect(await nextTask1).toEqual({ value: expected[0], done: false })
            expect(await nextTask2).toEqual({ value: expected[1], done: false })
            expect(await nextTask3).toEqual({ value: undefined, done: true })
        })

        it('can queue multiple pushes', async () => {
            const pushBuffer = new PushBuffer(3)
            expect(await pushBuffer.push(expected[0])).toBe(true)
            expect(await pushBuffer.push(expected[1])).toBe(true)
            const pushResolved1 = jest.fn((v) => v)
            const pushResolved2 = jest.fn((v) => v)
            const pushResolved3 = jest.fn((v) => v)
            // this shouldn't happen, should wait for previous push to resolve before pushing again
            const task1 = pushBuffer.push(expected[2]).then(pushResolved1)
            const task2 = pushBuffer.push(expected[3]).then(pushResolved2)
            const task3 = pushBuffer.push(expected[4]).then(pushResolved3)
            expect(pushResolved1).toHaveBeenCalledTimes(0)
            expect(pushResolved2).toHaveBeenCalledTimes(0)
            expect(pushResolved3).toHaveBeenCalledTimes(0)
            await wait(10)
            expect(pushResolved1).toHaveBeenCalledTimes(0)
            expect(pushResolved2).toHaveBeenCalledTimes(0)
            expect(pushResolved3).toHaveBeenCalledTimes(0)
            expect(await pushBuffer.next()).toEqual({ value: expected[0], done: false })
            await wait(0)
            expect(pushResolved1).toHaveBeenCalledTimes(0)
            expect(pushResolved2).toHaveBeenCalledTimes(0)
            expect(pushResolved3).toHaveBeenCalledTimes(0)
            expect(await pushBuffer.next()).toEqual({ value: expected[1], done: false })
            await wait(0)
            expect(pushResolved1).toHaveBeenCalledTimes(0)
            expect(pushResolved2).toHaveBeenCalledTimes(0)
            expect(pushResolved3).toHaveBeenCalledTimes(0)
            expect(await pushBuffer.next()).toEqual({ value: expected[2], done: false })
            await wait(0)
            // all unblock at once, push only resolves once buffer has space
            expect(pushResolved1).toHaveBeenCalledTimes(1)
            expect(pushResolved2).toHaveBeenCalledTimes(1)
            expect(pushResolved3).toHaveBeenCalledTimes(1)
            expect(await pushBuffer.next()).toEqual({ value: expected[3], done: false })
            await wait(0)
            expect(pushResolved1).toHaveBeenCalledTimes(1)
            expect(pushResolved2).toHaveBeenCalledTimes(1)
            expect(pushResolved3).toHaveBeenCalledTimes(1)
            expect(await pushBuffer.next()).toEqual({ value: expected[4], done: false })
            await wait(0)
            expect(pushResolved2).toHaveBeenCalledTimes(1)
            expect(pushResolved1).toHaveBeenCalledTimes(1)
            expect(pushResolved3).toHaveBeenCalledTimes(1)
            await wait(0)
            expect(await task1).toBe(true)
            expect(await task2).toBe(true)
            expect(await task3).toBe(true)
        })

        describe('pull', () => {
            it('pulls until buffer full', async () => {
                const pushBuffer = new PushBuffer(3)
                let lastGenerated!: number
                const onFinallyAfter = jest.fn()
                const onFinally = jest.fn(async () => {
                    await wait(0)
                    onFinallyAfter()
                })
                async function* generateWithLast() {
                    try {
                        for await (const v of generate()) {
                            lastGenerated = v
                            yield v
                        }
                    } finally {
                        await onFinally()
                    }
                }

                pull(generateWithLast(), pushBuffer)

                await wait(WAIT * 10) // give time to generate too many
                expect(lastGenerated).toBe(expected[2])
                // pulling one item out of the buffer should pull from source again
                expect(await pushBuffer.next()).toEqual({ value: expected[0], done: false })
                await wait(WAIT * 2) // should only pull next item
                expect(lastGenerated).toBe(expected[3])
                // no mater how long we wait
                await wait(WAIT * 2)
                expect(lastGenerated).toBe(expected[3])
                // return should not pull any more
                await pushBuffer.return()
                expect(lastGenerated).toBe(expected[3])
                await wait(WAIT * 2)
                expect(lastGenerated).toBe(expected[3])
                // make sure generator ended
                expect(onFinally).toHaveBeenCalledTimes(1)
                expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            })
        })
    })
})
