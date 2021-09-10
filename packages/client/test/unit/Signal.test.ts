import Signal from '../../src/utils/Signal'
import { wait } from 'streamr-test-utils'

describe('Signal', () => {
    it('can trigger', async () => {
        const onSignal = jest.fn()
        const signal = Signal.create()
        signal(onSignal)
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
        signal(onSignal1)
        signal(onSignal2)
        await signal.trigger()
        expect(onSignal1).toHaveBeenCalledTimes(1)
        expect(onSignal2).toHaveBeenCalledTimes(1)
    })

    it('does not execute tasks immediately, but in next async tick', async () => {
        const onSignal = jest.fn()
        const signal = Signal.create()
        signal(onSignal)
        expect(onSignal).toHaveBeenCalledTimes(0)
        const triggerTask = signal.trigger()
        triggerTask.catch(() => {})
        expect(onSignal).toHaveBeenCalledTimes(0)
        await wait(0)
        expect(onSignal).toHaveBeenCalledTimes(1)
        await triggerTask
        expect(onSignal).toHaveBeenCalledTimes(1)
    })

    it('waits for tasks', async () => {
        const onSignalSlow = jest.fn()
        const onSignalFast = jest.fn()
        const signal = Signal.create()
        signal(async () => {
            await wait(25)
            onSignalSlow()
        })
        signal(onSignalFast)
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
        const onSignalTask = signal().then(onSignalFinished)
        onSignalTask.catch(() => {})
        await signal.trigger()
        expect(onSignalFinished).toHaveBeenCalledTimes(1)
        await onSignalTask
        expect(onSignalFinished).toHaveBeenCalledTimes(1)
    })

    it('provides async iterator', async () => {
        const signal = Signal.create<number>()
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
            signal(onSignal)
            const triggerTask1 = signal.trigger()
            triggerTask1.catch(() => {})
            const triggerTask2 = signal.trigger()
            triggerTask2.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(0)
            await wait(0)
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
            const signal = Signal.queue<number>()
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
            signal(onSignal)
            const triggerTask1 = signal.trigger()
            triggerTask1.catch(() => {})
            const triggerTask2 = signal.trigger()
            triggerTask2.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(0)
            await wait(0)
            expect(onSignalStarted).toHaveBeenCalledTimes(2)
            const triggerTask3 = signal.trigger()
            triggerTask3.catch(() => {})
            await wait(0)
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
            const signal = Signal.parallel<number>()
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
            signal(onSignal)
            const triggerTask1 = signal.trigger()
            triggerTask1.catch(() => {})
            const triggerTask2 = signal.trigger()
            triggerTask2.catch(() => {})
            expect(onSignalStarted).toHaveBeenCalledTimes(0)
            await wait(0)
            expect(onSignalStarted).toHaveBeenCalledTimes(1)
            const triggerTask3 = signal.trigger()
            triggerTask3.catch(() => {})
            await wait(0)
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
            signal(onSignal)
            await signal.trigger()
            await signal.trigger()
            await signal.trigger()
            expect(onSignal).toHaveBeenCalledTimes(1)
        })
    })
})
