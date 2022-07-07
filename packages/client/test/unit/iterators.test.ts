import { wait } from '@streamr/utils'

import { iteratorFinally, CancelableGenerator, nextValue } from '../../src/utils/iterators'
import { Defer } from '../../src/utils/Defer'

import { expected, MAX_ITEMS, IteratorTest } from './IteratorTest'

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

async function* generateThrow(items = expected, { max = MAX_ITEMS, err = new Error('expected') }) {
    let index = 0
    await wait(WAIT * 0.1)
    for await (const item of items) {
        index += 1
        await wait(WAIT * 0.1)
        if (index > max) {
            throw err
        }
        yield item
        await wait(WAIT * 0.1)
    }
    await wait(WAIT * 0.1)
}

describe('Iterator Utils', () => {
    describe('compare native generators', () => {
        IteratorTest('baseline', () => generate())
    })

    describe('iteratorFinally', () => {
        let onFinally: jest.Mock
        let onFinallyAfter: jest.Mock

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

        describe('iteratorFinally iteratorTests', () => {
            IteratorTest('iteratorFinally', () => iteratorFinally(generate(), onFinally))
        })

        it('runs fn when iterator.return() is called asynchronously', async () => {
            const done = Defer()
            try {
                const received: number[] = []
                const itr = iteratorFinally(generate(), onFinally)
                const onTimeoutReached = jest.fn()
                let receievedAtCallTime
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(done.wrap(() => {
                            onTimeoutReached()
                            receievedAtCallTime = received
                            itr.return(undefined)
                        }))
                    }
                }

                expect(onTimeoutReached).toHaveBeenCalledTimes(1)
                expect(received).toEqual(receievedAtCallTime)
            } finally {
                await done
            }
        })

        it('runs fn when iterator returns + breaks during iteration', async () => {
            const received: number[] = []
            const itr = iteratorFinally(generate(), onFinally)
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    itr.return(undefined) // no await
                    break
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('does not call inner iterators onFinally with error if outer errors', async () => {
            // maybe not desirable, but captures existing behaviour.
            // this matches native generator/iterator behaviour, at most outermost iteration errors
            const received: number[] = []
            const err = new Error('expected err')
            const itr = iteratorFinally(generate(), onFinally)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            expect(onFinally).not.toHaveBeenCalledWith(err)
        })

        it('runs fn when iterator returns + throws during iteration', async () => {
            const received: number[] = []
            const err = new Error('expected err')
            const itr = iteratorFinally(generate(), onFinally)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        itr.return(undefined) // no await
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            expect(onFinally).not.toHaveBeenCalledWith(err) // just outer onFinally will have err
        })

        it('runs fn when iterator returns before iteration', async () => {
            const received: number[] = []
            const itr = iteratorFinally(generate(), onFinally)
            await itr.return(undefined)
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('runs fn when iterator returns before iteration', async () => {
            const received: number[] = []
            const onStarted = jest.fn()
            const itr = iteratorFinally((async function* Test() {
                onStarted()
                yield* generate()
            }()), async () => {
                await wait(WAIT * 5)
                await onFinally()
            })
            itr.return(undefined) // no await
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(onStarted).toHaveBeenCalledTimes(0)
            expect(received).toEqual([])
        })

        it('runs finally once, waits for outstanding if returns before iteration', async () => {
            const received: number[] = []
            const itr = iteratorFinally(generate(), onFinally)

            const t1 = itr.return(undefined)
            const t2 = itr.return(undefined)
            await Promise.race([t1, t2])
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            await Promise.all([t1, t2])
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            for await (const msg of itr) {
                received.push(msg)
            }

            expect(received).toEqual([])
        })

        it('runs fn when iterator throws before iteration', async () => {
            const received: number[] = []
            const err = new Error('expected err')
            const itr = iteratorFinally(generate(), onFinally)
            await expect(async () => itr.throw(err)).rejects.toThrow(err)
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            // NOTE: doesn't throw, matches native iterators
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('runs fn when inner iterator throws during iteration', async () => {
            const received: number[] = []
            const err = new Error('expected err')
            const itr = iteratorFinally(generateThrow(expected, {
                err,
            }), onFinally)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('errored before start iterator works if onFinally is async', async () => {
            const received: number[] = []
            const errs: Error[] = []
            const onFinallyDelayed = jest.fn(async (err) => {
                errs.push(err)
                await wait(100)
                return onFinally(err)
            })
            const itr = iteratorFinally(generate(), onFinallyDelayed)
            const err = new Error('expected err 1')
            await expect(async () => {
                await itr.throw(err)
            }).rejects.toThrow(err)
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
            expect(onFinallyDelayed).toHaveBeenCalledTimes(1)
            expect(errs).toEqual([err])
        })

        it('errored iterator works if onFinally is async', async () => {
            const received: number[] = []
            const errs: Error[] = []
            const onFinallyDelayed = jest.fn(async (err) => {
                errs.push(err)
                await wait(100)
                return onFinally(err)
            })
            const itr = iteratorFinally(generate(), onFinallyDelayed)
            const err = new Error('expected err 2')
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        await itr.throw(err)
                    }
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            expect(onFinallyDelayed).toHaveBeenCalledTimes(1)
            expect(errs).toEqual([err])
        })

        describe('nesting', () => {
            let onFinallyInnerAfter: jest.Mock
            let onFinallyInner: jest.Mock

            beforeEach(() => {
                onFinallyInnerAfter = jest.fn()
                const afterInner = onFinallyInnerAfter // capture so won't run afterInner of another test
                onFinallyInner = jest.fn(async () => {
                    await wait(WAIT)
                    afterInner()
                })
            })

            afterEach(() => {
                expect(onFinallyInner).toHaveBeenCalledTimes(1)
                expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)
            })

            IteratorTest('iteratorFinally nested', () => {
                const itrInner = iteratorFinally(generate(), onFinallyInner)
                return iteratorFinally(itrInner, onFinally)
            })

            it('works nested', async () => {
                const itrInner = iteratorFinally(generate(), onFinallyInner)
                const itr = iteratorFinally(itrInner, onFinally)

                const received: number[] = []
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        break
                    }
                }

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            })

            it('calls iterator onFinally with error if outer errors', async () => {
                const received: number[] = []
                const err = new Error('expected err')
                const innerItr = iteratorFinally(generate(), onFinallyInner)
                const itr = iteratorFinally((async function* Outer() {
                    for await (const msg of innerItr) {
                        yield msg
                        if (received.length === MAX_ITEMS) {
                            throw err
                        }
                    }
                }()), onFinally)

                await expect(async () => {
                    for await (const msg of itr) {
                        received.push(msg)
                    }
                }).rejects.toThrow(err)

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
                expect(onFinally).toHaveBeenCalledWith(err)
                expect(onFinallyInner).not.toHaveBeenCalledWith(err)
            })

            it('calls iterator onFinally with error if inner errors', async () => {
                const received: number[] = []
                const err = new Error('expected err')
                const itrInner = iteratorFinally((async function* Outer() {
                    for await (const msg of generate()) {
                        yield msg
                        if (received.length === MAX_ITEMS) {
                            throw err
                        }
                    }
                }()), onFinallyInner)
                const itr = iteratorFinally(itrInner, onFinally)

                await expect(async () => {
                    for await (const msg of itr) {
                        received.push(msg)
                    }
                }).rejects.toThrow(err)

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
                // both should see error
                expect(onFinally).toHaveBeenCalledWith(err)
                expect(onFinallyInner).toHaveBeenCalledWith(err)
            })
        })

        it('runs finally once, waits for outstanding', async () => {
            const received: number[] = []
            const itr = iteratorFinally(generate(), onFinally)

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    const t1 = itr.return(undefined)
                    const t2 = itr.return(undefined)
                    await Promise.race([t1, t2])
                    expect(onFinally).toHaveBeenCalledTimes(1)
                    expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                    await Promise.all([t1, t2])
                    expect(onFinally).toHaveBeenCalledTimes(1)
                    expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                    break
                }
            }

            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })
    })

    describe('CancelableGenerator', () => {
        let onFinally: jest.Mock
        let onFinallyAfter: jest.Mock

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

        IteratorTest('CancelableGenerator', () => {
            return CancelableGenerator(generate(), onFinally)
        })

        it('can cancel during iteration', async () => {
            const itr = CancelableGenerator(generate(), onFinally)
            const received: number[] = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    itr.cancel()
                }
            }

            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            expect(itr.isCancelled()).toEqual(true)
        })

        it('can cancel before iteration', async () => {
            const itr = CancelableGenerator(generate(), onFinally)
            const received: number[] = []
            itr.cancel()
            expect(itr.isCancelled()).toEqual(true)
            for await (const msg of itr) {
                received.push(msg)
            }

            expect(received).toEqual([])
            expect(itr.isCancelled()).toEqual(true)
        })

        it('can cancel with error before iteration', async () => {
            const itr = CancelableGenerator(generate(), () => {
                return onFinally()
            })
            const received: number[] = []
            const err = new Error('expected')
            itr.cancel(err)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual([])
        })

        it('cancels with error when iterator.cancel(err) is called asynchronously with error', async () => {
            const done = Defer()
            try {
                const err = new Error('expected')
                const received: number[] = []
                const itr = CancelableGenerator(generate(), onFinally, {
                    timeout: WAIT,
                })
                let receievedAtCallTime
                await expect(async () => {
                    for await (const msg of itr) {
                        received.push(msg)
                        if (received.length === MAX_ITEMS) {
                            // eslint-disable-next-line no-loop-func
                            setTimeout(done.wrap(async () => {
                                receievedAtCallTime = received
                                await itr.cancel(err)
                                expect(onFinally).toHaveBeenCalledTimes(1)
                                expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                            }))
                        }
                    }
                }).rejects.toThrow(err)

                expect(received).toEqual(receievedAtCallTime)
                expect(itr.isCancelled()).toEqual(true)
            } catch (err) {
                done.reject(err)
            } finally {
                await done
            }
        })

        it('cancels when iterator.cancel() is called asynchronously', async () => {
            const done = Defer()
            try {
                const received: number[] = []
                const itr = CancelableGenerator(generate(), onFinally, {
                    timeout: WAIT,
                })
                let receievedAtCallTime
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(done.wrap(async () => {
                            receievedAtCallTime = received
                            await itr.cancel()
                            expect(onFinally).toHaveBeenCalledTimes(1)
                            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                        }))
                    }
                }

                expect(received).toEqual(receievedAtCallTime)
                expect(itr.isCancelled()).toEqual(true)
            } finally {
                await done
            }
        })

        it('prevents subsequent .next call', async () => {
            const received: any[] = []
            const triggeredForever = jest.fn()
            const itr = CancelableGenerator((async function* Gen() {
                yield* expected
                yield await new Promise(() => {
                    triggeredForever() // should not get here
                })
            }()), onFinally)

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === expected.length) {
                    await itr.cancel()
                    expect(onFinally).toHaveBeenCalledTimes(1)
                    expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                }
            }

            expect(triggeredForever).toHaveBeenCalledTimes(0)
            expect(received).toEqual(expected)
            expect(itr.isCancelled()).toEqual(true)
        })

        it('interrupts outstanding .next call', async () => {
            const received: any[] = []
            const triggeredForever = jest.fn()
            const itr = CancelableGenerator((async function* Gen() {
                yield* expected
                yield await new Promise(() => {
                    triggeredForever()
                    itr.cancel()
                }) // would wait forever
            }()), onFinally)

            for await (const msg of itr) {
                received.push(msg)
            }

            expect(triggeredForever).toHaveBeenCalledTimes(1)
            expect(received).toEqual(expected)
            expect(itr.isCancelled()).toEqual(true)
        })

        it('interrupts outstanding .next call when called asynchronously', async () => {
            const done = Defer()
            try {
                const received: any[] = []
                const triggeredForever = jest.fn()
                const itr = CancelableGenerator((async function* Gen() {
                    yield* expected
                    yield await new Promise(() => {
                        triggeredForever()
                    }) // would wait forever
                }()), onFinally, {
                    timeout: WAIT,
                })

                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === expected.length) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(done.wrap(async () => {
                            await itr.cancel()
                            expect(onFinally).toHaveBeenCalledTimes(1)
                            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                        }))
                    }
                }

                expect(received).toEqual(expected)
                expect(itr.isCancelled()).toEqual(true)
            } finally {
                await done
            }
        })

        it('stops iterator', async () => {
            const shouldRunFinally = jest.fn()
            const itr = CancelableGenerator((async function* Gen() {
                try {
                    yield 1
                    await wait(WAIT)
                    yield 2
                    await wait(WAIT)
                    yield 3
                } finally {
                    shouldRunFinally()
                }
            }()), onFinally, {
                timeout: WAIT * 2
            })

            const received: number[] = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === 2) {
                    itr.cancel()
                    expect(itr.isCancelled()).toEqual(true)
                }
            }

            expect(received).toEqual([1, 2])
            await wait(WAIT)
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(shouldRunFinally).toHaveBeenCalledTimes(1)
            expect(itr.isCancelled()).toEqual(true)
        })

        it('interrupts outstanding .next call with error', async () => {
            const done = Defer()
            try {
                const received: any[] = []
                const itr = CancelableGenerator((async function* Gen() {
                    yield* expected
                    yield await new Promise(() => {}) // would wait forever
                }()), onFinally, {
                    timeout: WAIT,
                })

                const err = new Error('expected')

                let receievedAtCallTime
                await expect(async () => {
                    for await (const msg of itr) {
                        received.push(msg)
                        if (received.length === MAX_ITEMS) {
                            // eslint-disable-next-line no-loop-func
                            setTimeout(done.wrap(async () => {
                                receievedAtCallTime = received
                                await itr.cancel(err)

                                expect(onFinally).toHaveBeenCalledTimes(1)
                                expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                            }))
                        }
                    }
                }).rejects.toThrow(err)

                expect(received).toEqual(receievedAtCallTime)
                expect(itr.isCancelled()).toEqual(true)
            } finally {
                await done
            }
        })

        it('can handle queued next calls', async () => {
            const done = Defer()
            try {
                const triggeredForever = jest.fn()
                const itr = CancelableGenerator((async function* Gen() {
                    yield* expected
                    setTimeout(done.wrap(async () => {
                        await itr.cancel()

                        expect(onFinally).toHaveBeenCalledTimes(1)
                        expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                    }), WAIT * 2)
                    yield await new Promise(() => {
                        triggeredForever()
                    }) // would wait forever
                }()), onFinally, {
                    timeout: WAIT,
                })

                const tasks = expected.map(async () => itr.next())
                tasks.push(itr.next()) // one more over the edge (should trigger forever promise)
                const received = await Promise.all(tasks)
                expect(received.map(({ value }) => value)).toEqual([...expected, undefined])
                expect(triggeredForever).toHaveBeenCalledTimes(1)
                expect(itr.isCancelled()).toEqual(true)
            } finally {
                await done
            }
        })

        it('can handle errs when queued next calls', async () => {
            const expectedError = new Error('expected')
            const itr = CancelableGenerator((async function* Gen() {
                yield* generate(expected, 1000)
            }()), onFinally, {
                timeout: WAIT,
            })

            const tasks = expected.map(async () => itr.next())
            await wait(100)
            await itr.cancel(expectedError)
            const result = await Promise.allSettled(tasks)
            // first is error
            expect(result[0]).toEqual({ status: 'rejected', reason: expectedError })
            // rest is undefined result
            // not sure what good behaviour should be in this case
            expect(result.slice(1)).toEqual(result.slice(1).map(() => ({
                status: 'fulfilled',
                value: {
                    value: undefined,
                    done: true
                }
            })))
            expect(itr.isCancelled()).toEqual(true)
        }, 10000)

        it('can handle queued next calls resolving out of order', async () => {
            const done = Defer()
            try {
                const triggeredForever = jest.fn()
                const itr = CancelableGenerator((async function* Gen() {
                    let i = 0
                    for await (const v of expected) {
                        i += 1
                        await wait((expected.length - i - 1) * 2 * WAIT)
                        yield v
                    }

                    setTimeout(done.wrap(async () => {
                        await itr.cancel()

                        expect(onFinally).toHaveBeenCalledTimes(1)
                        expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                    }), WAIT * 2)

                    yield await new Promise(() => {
                        triggeredForever()
                    }) // would wait forever
                }()), onFinally, {
                    timeout: WAIT,
                })

                const tasks = expected.map(async () => itr.next())
                tasks.push(itr.next()) // one more over the edge (should trigger forever promise)
                const received = await Promise.all(tasks)
                expect(received.map(({ value }) => value)).toEqual([...expected, undefined])
                expect(triggeredForever).toHaveBeenCalledTimes(1)
            } finally {
                await done
            }
        })

        it('ignores err if cancelled', async () => {
            const done = Defer()
            try {
                const received: number[] = []
                const err = new Error('expected')
                const d = Defer()
                const itr = CancelableGenerator((async function* Gen() {
                    yield* expected
                    await wait(WAIT * 2)
                    d.resolve(undefined)
                    throw new Error('should not see this')
                }()), onFinally)

                let receievedAtCallTime
                await expect(async () => {
                    for await (const msg of itr) {
                        received.push(msg)
                        if (received.length === MAX_ITEMS) {
                            // eslint-disable-next-line no-loop-func
                            setTimeout(done.wrap(async () => {
                                receievedAtCallTime = received
                                await itr.cancel(err)

                                expect(onFinally).toHaveBeenCalledTimes(1)
                                expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                            }))
                        }
                    }
                }).rejects.toThrow(err)

                await d
                await wait(WAIT * 2)

                expect(received).toEqual(receievedAtCallTime)
            } finally {
                await done
            }
        })

        describe('nesting', () => {
            let onFinallyInnerAfter: jest.Mock
            let onFinallyInner: jest.Mock

            beforeEach(() => {
                onFinallyInnerAfter = jest.fn()
                const afterInner = onFinallyInnerAfter // capture so won't run afterInner of another test
                onFinallyInner = jest.fn(async () => {
                    await wait(WAIT)
                    afterInner()
                })
            })

            afterEach(() => {
                expect(onFinallyInner).toHaveBeenCalledTimes(1)
                expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)
            })

            IteratorTest('CancelableGenerator nested', () => {
                const itrInner = CancelableGenerator(generate(), onFinallyInner)
                const itrOuter = CancelableGenerator(itrInner, onFinally)
                return itrOuter
            })

            it('can cancel nested cancellable iterator in finally', async () => {
                const waitInner = jest.fn()
                const itrInner = CancelableGenerator((async function* Gen() {
                    yield* generate()
                    yield await new Promise(() => {
                        // should not get here
                        waitInner()
                    }) // would wait forever
                }()), onFinallyInner, {
                    timeout: WAIT,
                })

                const waitOuter = jest.fn()
                const itrOuter = CancelableGenerator((async function* Gen() {
                    yield* itrInner
                    yield await new Promise(() => {
                        // should not get here
                        waitOuter()
                    }) // would wait forever
                }()), async () => {
                    await itrInner.cancel()
                    expect(onFinallyInner).toHaveBeenCalledTimes(1)
                    expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)
                    await onFinally()
                }, {
                    timeout: WAIT,
                })

                const received: any[] = []
                for await (const msg of itrOuter) {
                    received.push(msg)
                    if (received.length === expected.length) {
                        await itrOuter.cancel()
                    }
                }

                expect(received).toEqual(expected)
                expect(waitOuter).toHaveBeenCalledTimes(0)
                expect(waitInner).toHaveBeenCalledTimes(0)
            })

            it('can cancel nested cancellable iterator in finally, asynchronously', async () => {
                const done = Defer()
                try {
                    const waitInner = jest.fn()
                    const itrInner = CancelableGenerator((async function* Gen() {
                        yield* generate()
                        yield await new Promise(() => {
                            // should not get here
                            waitInner()
                        }) // would wait forever
                    }()), onFinallyInner, {
                        timeout: WAIT,
                    })

                    const waitOuter = jest.fn()
                    const itrOuter = CancelableGenerator((async function* Gen() {
                        yield* itrInner
                        yield await new Promise(() => {
                            // should not get here
                            waitOuter()
                        }) // would wait forever
                    }()), async () => {
                        await itrInner.cancel()
                        await onFinally()
                    }, {
                        timeout: WAIT,
                    })

                    const received: any[] = []
                    for await (const msg of itrOuter) {
                        received.push(msg)
                        if (received.length === expected.length) {
                            setTimeout(done.wrap(() => {
                                itrOuter.cancel()
                            }))
                        }
                    }

                    expect(waitOuter).toHaveBeenCalledTimes(1)
                    expect(waitInner).toHaveBeenCalledTimes(1)
                    expect(received).toEqual(expected)
                } finally {
                    await done
                }
            })
        })

        it('can cancel in parallel and wait correctly for both', async () => {
            const itr = CancelableGenerator(generate(), onFinally)
            const ranTests = jest.fn()

            const received: number[] = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    const t1 = itr.cancel()
                    const t2 = itr.cancel()
                    await Promise.race([t1, t2])
                    expect(onFinally).toHaveBeenCalledTimes(1)
                    expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                    await Promise.all([t1, t2])
                    expect(onFinally).toHaveBeenCalledTimes(1)
                    expect(onFinallyAfter).toHaveBeenCalledTimes(1)
                    ranTests()
                }
            }

            expect(ranTests).toHaveBeenCalledTimes(1)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })
    })
})

describe('nextValue', () => {
    it('happy path', async () => {
        const generator = async function* () {
            yield 1
            yield 2
        }()
        expect(await nextValue(generator)).toBe(1)
        expect(await nextValue(generator)).toBe(2)
        expect(await nextValue(generator)).toBe(undefined)
    })

    it('return value', async () => {
        const generator = async function* () {
            yield 1
            return 2
        }()
        expect(await nextValue(generator)).toBe(1)
        expect(await nextValue(generator)).toBe(2)
        expect(await nextValue(generator)).toBe(undefined)
    })

    it('empty', async () => {
        const generator = async function* () {}()
        expect(await nextValue(generator)).toBe(undefined)
    })
})
