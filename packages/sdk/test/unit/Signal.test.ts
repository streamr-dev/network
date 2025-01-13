import { Signal } from '../../src/utils/Signal'
import { wait } from '@streamr/utils'

describe('Signal', () => {
    it('can trigger', async () => {
        const onSignal = jest.fn()
        const signal = Signal.create()
        signal.listen(onSignal)
        await signal.trigger()
        expect(onSignal).toHaveBeenCalledTimes(1)
        await signal.trigger()
        expect(onSignal).toHaveBeenCalledTimes(2)
        await signal.trigger()
        expect(onSignal).toHaveBeenCalledTimes(3)
    })

    it('executes tasks in order', async () => {
        const callOrder: number[] = []
        const onSignal1 = jest.fn(() => {
            callOrder.push(1)
        })
        const onSignal2 = jest.fn(() => {
            callOrder.push(2)
        })
        const signal = Signal.create()
        signal.listen(onSignal1)
        signal.listen(onSignal2)
        await signal.trigger()
        expect(onSignal1).toHaveBeenCalledTimes(1)
        expect(onSignal2).toHaveBeenCalledTimes(1)
    })

    it('does not execute tasks immediately, but in next async tick', async () => {
        const onSignal = jest.fn()
        const signal = Signal.create()
        signal.listen(onSignal)
        expect(onSignal).toHaveBeenCalledTimes(0)
        const triggerTask = signal.trigger()
        triggerTask.catch(() => {})
        expect(onSignal).toHaveBeenCalledTimes(0)
        // one tick
        await Promise.resolve()
        expect(onSignal).toHaveBeenCalledTimes(1)
        await triggerTask
        expect(onSignal).toHaveBeenCalledTimes(1)
    })

    it('waits for tasks', async () => {
        const onSignalSlow = jest.fn()
        const onSignalFast = jest.fn()
        const signal = Signal.create()
        signal.listen(async () => {
            await wait(25)
            onSignalSlow()
        })
        signal.listen(onSignalFast)
        const triggerTask = signal.trigger()
        triggerTask.catch(() => {})
        expect(onSignalSlow).toHaveBeenCalledTimes(0)
        expect(onSignalFast).toHaveBeenCalledTimes(0)
        // slow attached first, won't call either until slow finished
        await wait(5)
        // slow shouldn't have finished yet
        expect(onSignalSlow).toHaveBeenCalledTimes(0)
        expect(onSignalFast).toHaveBeenCalledTimes(0)
        await wait(25)
        // now slow should have finished, both should have fired.
        expect(onSignalSlow).toHaveBeenCalledTimes(1)
        expect(onSignalFast).toHaveBeenCalledTimes(1)
        await triggerTask
        expect(onSignalSlow).toHaveBeenCalledTimes(1)
        expect(onSignalFast).toHaveBeenCalledTimes(1)
    })

    it('returns promise if no listener is provided', async () => {
        const onSignalFinished = jest.fn()
        const signal = Signal.create()
        const onSignalTask = signal.listen().then(onSignalFinished)
        onSignalTask.catch(() => {})
        await signal.trigger()
        expect(onSignalFinished).toHaveBeenCalledTimes(1)
        await onSignalTask
        expect(onSignalFinished).toHaveBeenCalledTimes(1)
    })

    it('provides async iterator', async () => {
        const signal = Signal.create<[number]>()
        setTimeout(async () => {
            await signal.trigger(1)
            await signal.trigger(2)
            await signal.trigger(3)
        })

        const expectedResults = [1, 2, 3]
        const results: number[] = []
        for await (const v of signal) {
            results.push(v)
            if (results.length === expectedResults.length) {
                break
            }
        }
        expect(results).toEqual(expectedResults)
    })

    it('throws trigger if handler errors', async () => {
        const err = new Error('expected error')
        const onSignal = jest.fn(() => {
            throw err
        })
        const signal = Signal.create()
        signal.listen(onSignal)
        await expect(async () => {
            await signal.trigger()
        }).rejects.toThrow(err)
        expect(onSignal).toHaveBeenCalledTimes(1)
    })

    it('stops executing handlers if handler errors', async () => {
        const handler1 = jest.fn()
        const err = new Error('expected error')
        const handler2 = jest.fn(() => {
            throw err
        })
        const handler3 = jest.fn()
        const signal = Signal.create()
        signal.listen(handler1)
        signal.listen(handler2)
        signal.listen(handler3)
        await expect(async () => {
            await signal.trigger()
        }).rejects.toThrow(err)
        expect(handler1).toHaveBeenCalledTimes(1)
        expect(handler2).toHaveBeenCalledTimes(1)
        expect(handler3).toHaveBeenCalledTimes(0)
    })

    it('can trigger again after error', async () => {
        const handler1 = jest.fn()
        const err = new Error('expected error')
        let count = 0
        const handler2 = jest.fn(() => {
            count += 1
            if (count === 1) {
                throw err
            }
        })
        const handler3 = jest.fn()
        const signal = Signal.create()
        signal.listen(handler1)
        signal.listen(handler2)
        signal.listen(handler3)
        await expect(async () => {
            await signal.trigger()
        }).rejects.toThrow(err)
        expect(handler1).toHaveBeenCalledTimes(1)
        expect(handler2).toHaveBeenCalledTimes(1)
        expect(handler3).toHaveBeenCalledTimes(0)
        await signal.trigger()
        expect(handler1).toHaveBeenCalledTimes(2)
        expect(handler2).toHaveBeenCalledTimes(2)
        expect(handler3).toHaveBeenCalledTimes(1)
        await signal.trigger()
        expect(handler1).toHaveBeenCalledTimes(3)
        expect(handler2).toHaveBeenCalledTimes(3)
        expect(handler3).toHaveBeenCalledTimes(2)
    })

    describe('Signal.queue', () => {
        it('waits until listeners finished before triggering again', async () => {
            const onSignalStarted = jest.fn()
            const onSignalFinished = jest.fn()
            const onSignal = async () => {
                onSignalStarted()
                await wait(10)
                onSignalFinished()
            }
            const signal = Signal.queue()
            signal.listen(onSignal)
            const triggerTask1 = signal.trigger()
            triggerTask1.catch(() => {})
            const triggerTask2 = signal.trigger()
            triggerTask2.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(0)
            // queue takes 2 ticks
            await Promise.resolve()
            await Promise.resolve()
            expect(onSignalStarted).toHaveBeenCalledTimes(1)
            const triggerTask3 = signal.trigger()
            triggerTask3.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(1)
            expect(onSignalFinished).toHaveBeenCalledTimes(0)
            await triggerTask1
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            expect(onSignalStarted).toHaveBeenCalledTimes(2)
            await triggerTask2
            expect(onSignalFinished).toHaveBeenCalledTimes(2)
            expect(onSignalStarted).toHaveBeenCalledTimes(3)
            await triggerTask3
            expect(onSignalFinished).toHaveBeenCalledTimes(3)
            expect(onSignalStarted).toHaveBeenCalledTimes(3)
        })

        it('has async iterator that supports parallel triggers', async () => {
            const signal = Signal.queue<[number]>()
            setTimeout(async () => {
                signal.trigger(1)
                signal.trigger(2)
                signal.trigger(3)
            })

            const expectedResults = [1, 2, 3]
            const results: number[] = []
            for await (const v of signal) {
                results.push(v)
                if (results.length === expectedResults.length) {
                    break
                }
                // should end automatically
            }
            expect(results).toEqual(expectedResults)
        })
    })

    describe('Signal.parallel', () => {
        it('executes trigger listeners in parallel', async () => {
            const onSignalStarted = jest.fn()
            const onSignalFinished = jest.fn()
            const onSignal = async () => {
                onSignalStarted()
                await wait(10)
                onSignalFinished()
            }
            const signal = Signal.parallel()
            signal.listen(onSignal)
            const triggerTask1 = signal.trigger()
            triggerTask1.catch(() => {})
            const triggerTask2 = signal.trigger()
            triggerTask2.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(0)
            await Promise.resolve()
            expect(onSignalStarted).toHaveBeenCalledTimes(2)
            const triggerTask3 = signal.trigger()
            triggerTask3.catch(() => {})
            await Promise.resolve()
            expect(onSignalStarted).toHaveBeenCalledTimes(3)
            await triggerTask1
            expect(onSignalStarted).toHaveBeenCalledTimes(3)
            await triggerTask2
            expect(onSignalStarted).toHaveBeenCalledTimes(3)
            await triggerTask3
            expect(onSignalFinished).toHaveBeenCalledTimes(3)
            expect(onSignalStarted).toHaveBeenCalledTimes(3)
        })

        it('has async iterator that does not support parallel triggers', async () => {
            const signal = Signal.parallel<[number]>()
            setTimeout(async () => {
                signal.trigger(1)
                signal.trigger(2)
                signal.trigger(3)
            })

            const expectedResults = [1, 4] // 2, 3 will be lost due to parallel
            // i.e. when they were triggered, the next listener was not added yet
            // can't really resolve this without buffering
            const results: number[] = []
            for await (const v of signal) {
                results.push(v)
                if (results.length === 1) {
                    setTimeout(() => {
                        signal.trigger(4)
                    }, 10)
                }

                if (results.length === expectedResults.length) {
                    break
                }
            }
            expect(results).toEqual(expectedResults)
        })
    })

    describe('Signal.one', () => {
        it('same trigger until complete', async () => {
            const onSignalStarted = jest.fn()
            const onSignalFinished = jest.fn()
            const onSignal = async () => {
                onSignalStarted()
                await wait(100)
                onSignalFinished()
            }
            const signal = Signal.one()
            signal.listen(onSignal)
            const triggerTask1 = signal.trigger()
            triggerTask1.catch(() => {})
            const triggerTask2 = signal.trigger()
            triggerTask2.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(0)
            await Promise.resolve()
            expect(onSignalStarted).toHaveBeenCalledTimes(1)
            const triggerTask3 = signal.trigger()
            triggerTask3.catch(() => {})
            await Promise.resolve()
            expect(onSignalStarted).toHaveBeenCalledTimes(1)
            expect(onSignalFinished).toHaveBeenCalledTimes(0)
            await triggerTask1
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            await triggerTask2
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            await triggerTask3
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            expect(onSignalFinished).toHaveBeenCalledTimes(1)
            await signal.trigger()
            expect(onSignalStarted).toHaveBeenCalledTimes(2)
            expect(onSignalFinished).toHaveBeenCalledTimes(2)
        })
    })

    describe('Signal.once', () => {
        it('only triggers once', async () => {
            const onSignal = jest.fn()
            const signal = Signal.once()
            signal.listen(onSignal)
            await signal.trigger()
            await signal.trigger()
            await signal.trigger()
            expect(onSignal).toHaveBeenCalledTimes(1)
        })
        it('only triggers once when executed in parallel', async () => {
            const onSignal = jest.fn(async () => {
                await wait(10)
            })
            const signal = Signal.once()
            signal.listen(onSignal)
            await Promise.all([signal.trigger(), signal.trigger()])
            await signal.trigger()
            expect(onSignal).toHaveBeenCalledTimes(1)
        })

        it('resolves same value', async () => {
            const value = { someValue: 1 }
            type ValueType = typeof value
            const otherValue: ValueType = { someValue: 2 }
            const results: ValueType[] = []
            const onSignal = jest.fn((v: ValueType) => {
                results.push(v)
            })
            const signal = Signal.once<[ValueType]>()
            signal.listen(onSignal)
            await Promise.all([
                // test parallel
                signal.trigger(value),
                signal.trigger(otherValue)
            ])
            // test serial
            await signal.trigger(value)
            await signal.trigger(otherValue)
            expect(results[0]).toBe(value)
            expect(results).toHaveLength(1)
            expect(onSignal).toHaveBeenCalledTimes(1)
            // wait should give same value
            const waitResult = await signal.wait()
            expect(waitResult).toBe(value)
            expect(onSignal).toHaveBeenCalledTimes(1)

            // adding new handlers should fire them on next async tick
            const results2: ValueType[] = []
            const onSignal2 = jest.fn((v: ValueType) => {
                results2.push(v)
            })
            signal.listen(onSignal2)
            await Promise.resolve()
            expect(onSignal2).toHaveBeenCalledTimes(1)
            expect(results2[0]).toBe(value)
            expect(results2).toHaveLength(1)
        })

        it('keeps rejecting if errored', async () => {
            const err = new Error('expected')
            const onSignal = jest.fn(() => {
                throw err
            })
            const signal = Signal.once()
            signal.listen(onSignal)
            await expect(async () => signal.trigger()).rejects.toThrow(err)
            await expect(async () => signal.trigger()).rejects.toThrow(err)
            await expect(async () => signal.trigger()).rejects.toThrow(err)
            expect(onSignal).toHaveBeenCalledTimes(1)
        })
    })
})
