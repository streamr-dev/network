import { Readable, PassThrough } from 'stream'

import Debug from 'debug'
import { wait } from 'streamr-test-utils'

import { iteratorFinally, CancelableGenerator, pipeline } from '../../src/iterators'
import { Defer } from '../../src/utils'

console.log = Debug('Streamr::   CONSOLE   ')

const expected = [1, 2, 3, 4, 5, 6, 7, 8]

const WAIT = 20

async function* generate(items = expected) {
    await wait(WAIT * 0.1)
    for await (const item of items) {
        await wait(WAIT * 0.1)
        yield item
        await wait(WAIT * 0.1)
    }
    await wait(WAIT * 0.1)
}

const MAX_ITEMS = 2

function IteratorTest(name, fn) {
    describe(`${name} IteratorTest`, () => {
        it('runs to completion', async () => {
            const received = []
            const itr = fn()
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual(expected)
        })

        it('can return in finally', async () => {
            const received = []
            const itr = (async function* Outer() {
                const innerItr = fn()[Symbol.asyncIterator]()
                try {
                    yield* innerItr
                } finally {
                    await innerItr.return() // note itr.return would block
                }
            }())

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    break
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('can return mid-iteration', async () => {
            const received = []
            for await (const msg of fn()) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    break
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('can throw mid-iteration', async () => {
            const received = []
            const err = new Error('expected err')
            await expect(async () => {
                for await (const msg of fn()) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('can throw before iterating', async () => {
            const received = []
            const itr = fn()[Symbol.asyncIterator]()
            const err = new Error('expected err')

            await expect(async () => {
                await itr.throw(err)
            }).rejects.toThrow(err)

            // does not throw
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('can return before iterating', async () => {
            const itr = fn()[Symbol.asyncIterator]()
            await itr.return()
            const received = []
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('can queue next calls', async () => {
            const itr = fn()[Symbol.asyncIterator]()
            const tasks = expected.map(async () => itr.next())
            const received = await Promise.all(tasks)
            expect(received.map(({ value }) => value)).toEqual(expected)
            await itr.return()
        })
    })
}

describe('Iterator Utils', () => {
    describe('compare native generators', () => {
        IteratorTest('baseline', () => generate())
    })

    describe('iteratorFinally', () => {
        let onFinally
        let onFinallyAfter

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
            const received = []
            const itr = iteratorFinally(generate(), onFinally)
            let receievedAtCallTime
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    // eslint-disable-next-line no-loop-func
                    setTimeout(() => {
                        receievedAtCallTime = received
                        itr.return()
                    })
                }

                setTimeout(() => {
                    itr.return()
                })
            }
            expect(received).toEqual(receievedAtCallTime)
        })

        it('runs fn when iterator returns + breaks during iteration', async () => {
            const received = []
            const itr = iteratorFinally(generate(), onFinally)
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    itr.return() // no await
                    break
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('does not call inner iterators onFinally with error if outer errors', async () => {
            // maybe not desirable, but captures existing behaviour.
            // this matches native generator/iterator behaviour, only outermost iteration actually errors
            const received = []
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
            const received = []
            const err = new Error('expected err')
            const itr = iteratorFinally(generate(), onFinally)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        itr.return() // no await
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            expect(onFinally).not.toHaveBeenCalledWith(err) // only outer onFinally will have err
        })

        it('runs fn when iterator returns before iteration', async () => {
            const received = []
            const itr = iteratorFinally(generate(), onFinally)
            await itr.return()
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        it('runs fn when iterator returns before iteration', async () => {
            const received = []
            const onStarted = jest.fn()
            const itr = iteratorFinally((async function* Test() {
                onStarted()
                yield* generate()
            }()), async () => {
                await wait(WAIT * 5)
                await onFinally()
            })
            itr.return() // no await
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(onStarted).toHaveBeenCalledTimes(0)
            expect(received).toEqual([])
        })

        it('runs finally once, waits for outstanding if returns before iteration', async () => {
            const received = []
            const itr = iteratorFinally(generate(), onFinally)

            const t1 = itr.return()
            const t2 = itr.return()
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
            const received = []
            const err = new Error('expected err')
            const itr = iteratorFinally(generate(), onFinally)
            await expect(async () => itr.throw(err)).rejects.toThrow(err)
            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(onFinallyAfter).toHaveBeenCalledTimes(1)
            // doesn't throw, matches native iterators
            for await (const msg of itr) {
                received.push(msg)
            }
            expect(received).toEqual([])
        })

        describe('nesting', () => {
            let onFinallyAfterInner
            let onFinallyInner

            beforeEach(() => {
                onFinallyAfterInner = jest.fn()
                const afterInner = onFinallyAfterInner // capture so won't run afterInner of another test
                onFinallyInner = jest.fn(async () => {
                    await wait(WAIT)
                    afterInner()
                })
            })

            afterEach(() => {
                expect(onFinallyInner).toHaveBeenCalledTimes(1)
                expect(onFinallyAfterInner).toHaveBeenCalledTimes(1)
            })

            IteratorTest('iteratorFinally nested', () => {
                const itrInner = iteratorFinally(generate(), onFinallyInner)
                return iteratorFinally(itrInner, onFinally)
            })

            it('works nested', async () => {
                const itrInner = iteratorFinally(generate(), onFinallyInner)
                const itr = iteratorFinally(itrInner, onFinally)

                const received = []
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        break
                    }
                }

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            })

            it('calls iterator onFinally with error if outer errors', async () => {
                const received = []
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
                const received = []
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
            const received = []
            const itr = iteratorFinally(generate(), onFinally)

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    const t1 = itr.return()
                    const t2 = itr.return()
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
        let onFinally
        let onFinallyAfter

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
            const [, itr] = CancelableGenerator(generate(), onFinally)
            return itr
        })

        it('can cancel during iteration', async () => {
            const [cancel, itr] = CancelableGenerator(generate(), onFinally)
            const received = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    cancel()
                }
            }

            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('can cancel before iteration', async () => {
            const [cancel, itr] = CancelableGenerator(generate(), onFinally)
            const received = []
            cancel()
            for await (const msg of itr) {
                received.push(msg)
            }

            expect(received).toEqual([])
        })

        it('can cancel with error before iteration', async () => {
            const [cancel, itr] = CancelableGenerator(generate(), onFinally)
            const received = []
            const err = new Error('expected')
            cancel(err)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual([])
        })

        it('cancels when iterator.cancel() is called asynchronously', async () => {
            const received = []
            const [cancel, itr] = CancelableGenerator(generate(), onFinally)
            let receievedAtCallTime
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    // eslint-disable-next-line no-loop-func
                    setTimeout(() => {
                        receievedAtCallTime = received
                        cancel()
                    })
                }
            }

            expect(received).toEqual(receievedAtCallTime)
        })

        it('interrupts outstanding .next call', async () => {
            const received = []
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                yield* expected
                yield await new Promise(() => {}) // would wait forever
            }()), onFinally)

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === expected.length) {
                    await cancel()
                }
            }

            expect(received).toEqual(expected)
        })

        it('interrupts outstanding .next call when called asynchronously', async () => {
            const received = []
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                yield* expected
                yield await new Promise(() => {}) // would wait forever
            }()), onFinally)

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === expected.length) {
                    // eslint-disable-next-line no-loop-func
                    setTimeout(() => {
                        cancel()
                    })
                }
            }

            expect(received).toEqual(expected)
        })

        it('stops iterator', async () => {
            const shouldRunFinally = jest.fn()
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                try {
                    yield 1
                    await wait(WAIT)
                    yield 2
                    await wait(WAIT)
                    yield 3
                } finally {
                    shouldRunFinally()
                }
            }()), onFinally)

            const received = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === 2) {
                    cancel()
                }
            }

            expect(received).toEqual([1, 2])
            await wait(WAIT)
            expect(shouldRunFinally).toHaveBeenCalledTimes(1)
        })

        it('interrupts outstanding .next call with error', async () => {
            const received = []
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                yield* expected
                yield await new Promise(() => {}) // would wait forever
            }()), onFinally)

            const err = new Error('expected')

            let receievedAtCallTime
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(() => {
                            receievedAtCallTime = received
                            cancel(err)
                        })
                    }
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(receievedAtCallTime)
        })

        it('can handle queued next calls', async () => {
            const triggeredForever = jest.fn()
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                yield* expected
                setTimeout(() => {
                    cancel()
                }, WAIT * 2)
                yield await new Promise(() => {
                    triggeredForever()
                }) // would wait forever
            }()), onFinally)

            const tasks = expected.map(async () => itr.next())
            tasks.push(itr.next()) // one more over the edge (should trigger forever promise)
            const received = await Promise.all(tasks)
            expect(received.map(({ value }) => value)).toEqual([...expected, undefined])
            expect(triggeredForever).toHaveBeenCalledTimes(1)
        })

        it('can handle queued next calls resolving out of order', async () => {
            const triggeredForever = jest.fn()
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                let i = 0
                for await (const v of expected) {
                    i += 1
                    await wait((expected.length - i - 1) * 2 * WAIT)
                    yield v
                }

                setTimeout(() => {
                    cancel()
                }, WAIT * 2)

                yield await new Promise(() => {
                    triggeredForever()
                }) // would wait forever
            }()), onFinally)

            const tasks = expected.map(async () => itr.next())
            tasks.push(itr.next()) // one more over the edge (should trigger forever promise)
            const received = await Promise.all(tasks)
            expect(received.map(({ value }) => value)).toEqual([...expected, undefined])
            expect(triggeredForever).toHaveBeenCalledTimes(1)
        })

        it('ignores err if cancelled', async () => {
            const received = []
            const err = new Error('expected')
            const d = Defer()
            const [cancel, itr] = CancelableGenerator((async function* Gen() {
                yield* expected
                await wait(WAIT * 2)
                d.resolve()
                throw new Error('should not see this')
            }()), onFinally)

            let receievedAtCallTime
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(() => {
                            receievedAtCallTime = received
                            cancel(err)
                        })
                    }
                }
            }).rejects.toThrow(err)

            await d
            await wait(WAIT * 2)

            expect(received).toEqual(receievedAtCallTime)
        })

        describe('nesting', () => {
            let onFinallyAfterInner
            let onFinallyInner

            beforeEach(() => {
                onFinallyAfterInner = jest.fn()
                const afterInner = onFinallyAfterInner // capture so won't run afterInner of another test
                onFinallyInner = jest.fn(async () => {
                    await wait(WAIT)
                    afterInner()
                })
            })

            afterEach(() => {
                expect(onFinallyInner).toHaveBeenCalledTimes(1)
                expect(onFinallyAfterInner).toHaveBeenCalledTimes(1)
            })

            IteratorTest('CancelableGenerator nested', () => {
                const [, itrInner] = CancelableGenerator(generate(), onFinallyInner)
                const [, itrOuter] = CancelableGenerator(itrInner, onFinally)
                return itrOuter
            })

            it('can cancel nested cancellable iterator in finally', async () => {
                const waitInner = jest.fn()
                const [cancelInner, itrInner] = CancelableGenerator((async function* Gen() {
                    yield* generate()
                    yield await new Promise(() => {
                        // should not get here
                        waitInner()
                    }) // would wait forever
                }()), onFinallyInner)

                const waitOuter = jest.fn()
                const [cancelOuter, itrOuter] = CancelableGenerator((async function* Gen() {
                    yield* itrInner
                    yield await new Promise(() => {
                        // should not get here
                        waitOuter()
                    }) // would wait forever
                }()), async () => {
                    await cancelInner()
                    await onFinally()
                })

                const received = []
                for await (const msg of itrOuter) {
                    received.push(msg)
                    if (received.length === expected.length) {
                        await cancelOuter()
                    }
                }

                expect(received).toEqual(expected)
                expect(waitOuter).toHaveBeenCalledTimes(0)
                expect(waitInner).toHaveBeenCalledTimes(0)
            })

            it('can cancel nested cancellable iterator in finally, asynchronously', async () => {
                const waitInner = jest.fn()
                const [cancelInner, itrInner] = CancelableGenerator((async function* Gen() {
                    yield* generate()
                    yield await new Promise(() => {
                        // should not get here
                        waitInner()
                    }) // would wait forever
                }()), onFinallyInner)

                const waitOuter = jest.fn()
                const [cancelOuter, itrOuter] = CancelableGenerator((async function* Gen() {
                    yield* itrInner
                    yield await new Promise(() => {
                        // should not get here
                        waitOuter()
                    }) // would wait forever
                }()), async () => {
                    await cancelInner()
                    await onFinally()
                })

                const received = []
                for await (const msg of itrOuter) {
                    received.push(msg)
                    if (received.length === expected.length) {
                        setTimeout(() => {
                            cancelOuter()
                        })
                    }
                }

                expect(waitOuter).toHaveBeenCalledTimes(1)
                expect(waitInner).toHaveBeenCalledTimes(1)
                expect(received).toEqual(expected)
            })
        })

        it('can cancel in parallel and wait correctly for both', async () => {
            const [cancel, itr] = CancelableGenerator(generate(), onFinally)
            const ranTests = jest.fn()

            const received = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    const t1 = cancel()
                    const t2 = cancel()
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

    describe('pipeline', () => {
        describe('baseline', () => {
            IteratorTest('pipeline', () => {
                return pipeline(
                    generate(),
                    async function* Step1(s) {
                        for await (const msg of s) {
                            yield msg * 2
                        }
                    },
                    async function* Step2(s) {
                        for await (const msg of s) {
                            yield msg / 2
                        }
                    }
                )
            })
        })

        it('feeds items from one to next', async () => {
            const receivedStep1 = []
            const receivedStep2 = []
            const afterStep1 = jest.fn()
            const afterStep2 = jest.fn()

            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep1.push(msg)
                            yield msg * 2
                        }
                    } finally {
                        afterStep1()
                    }
                },
                async function* Step2(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep2.push(msg)
                            yield msg * 10
                        }
                    } finally {
                        // ensure async finally works
                        await wait(WAIT)
                        afterStep2()
                    }
                }
            )

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(received).toEqual(expected.map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.map((v) => v * 2))
            expect(receivedStep1).toEqual(expected)
            expect(afterStep1).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
        })

        it('feeds items from one to next, stops all when start ends', async () => {
            const receivedStep1 = []
            const receivedStep2 = []
            const afterStep1 = jest.fn()
            const afterStep2 = jest.fn()
            const p = pipeline(
                expected,
                async function* Step1(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep1.push(msg)
                            yield msg * 2
                        }
                    } finally {
                        afterStep1()
                    }
                },
                async function* Step2(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep2.push(msg)
                            yield msg * 10
                        }
                    } finally {
                        afterStep2()
                    }
                }
            )

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(received).toEqual(expected.map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.map((v) => v * 2))
            expect(receivedStep1).toEqual(expected)
            expect(afterStep1).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
        })

        it('feeds items from one to next, stops all when middle ends', async () => {
            const receivedStep1 = []
            const receivedStep2 = []
            const afterStep1 = jest.fn()
            const afterStep2 = jest.fn()

            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep1.push(msg)
                            yield msg * 2
                            if (receivedStep1.length === MAX_ITEMS) {
                                break
                            }
                        }
                    } finally {
                        afterStep1()
                    }
                },
                async function* Step2(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep2.push(msg)
                            yield msg * 10
                        }
                    } finally {
                        afterStep2()
                    }
                }
            )

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(received).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 2))
            expect(receivedStep1).toEqual(expected.slice(0, MAX_ITEMS))
            expect(afterStep1).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
        })

        it('feeds items from one to next, stops all when middle throws', async () => {
            const receivedStep1 = []
            const receivedStep2 = []
            const afterStep1 = jest.fn()
            const afterStep2 = jest.fn()
            const err = new Error('expected')

            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep1.push(msg)
                            yield msg * 2
                            if (receivedStep1.length === MAX_ITEMS) {
                                throw err
                            }
                        }
                    } finally {
                        afterStep1()
                    }
                },
                async function* Step2(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep2.push(msg)
                            yield msg * 10
                        }
                    } finally {
                        afterStep2()
                    }
                }
            )

            const received = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 2))
            expect(receivedStep1).toEqual(expected.slice(0, MAX_ITEMS))
            expect(afterStep1).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
        })

        it('handles errors before', async () => {
            const err = new Error('expected')

            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    yield* s
                    throw err
                },
                async function* Step2(s) {
                    yield* s
                    yield await new Promise(() => {}) // would wait forever
                }
            )

            const received = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected)
        })

        it('handles errors after', async () => {
            const err = new Error('expected')

            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    yield* s
                },
                async function* Step2(s) {
                    yield* s
                    throw err
                }
            )

            const received = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected)
        })

        it('handles errors after', async () => {
            const err = new Error('expected')
            const receivedStep2 = []
            const shouldNotGetHere = jest.fn()

            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    yield* s
                },
                async function* Step2(s) {
                    for await (const msg of s) {
                        receivedStep2.push(msg)
                        yield msg
                        if (receivedStep2.length === MAX_ITEMS) {
                            await p.cancel(err)
                            shouldNotGetHere()
                        }
                    }
                }
            )

            const received = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(shouldNotGetHere).toHaveBeenCalledTimes(0)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('runs finallyfn', async () => {
            const onFinally = jest.fn()
            const p = pipeline(
                generate(),
                async function* Step1(s) {
                    yield* s
                },
                async function* finallyFn(s) {
                    yield* iteratorFinally(s, onFinally)
                }
            )
            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(onFinally).toHaveBeenCalledTimes(1)
            expect(received).toEqual(expected)
        })
    })

    describe('stream utilities', () => {
        let stream
        let onClose
        let onError

        beforeEach(() => {
            stream = new PassThrough({
                objectMode: true,
            })
            onClose = jest.fn()
            onError = jest.fn()
            stream.once('close', onClose)
            stream.once('error', onError)
        })

        describe('StreamIterator', () => {
            beforeEach(() => {
                Readable.from(generate()).pipe(stream)
            })

            it('closes stream when iterator complete', async () => {
                const received = []
                for await (const msg of stream) {
                    received.push(msg)
                    if (received.length === expected.length) {
                        break
                    }
                }

                expect(onClose).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(0)
                expect(received).toEqual(expected)
            })

            it('closes stream when iterator returns during iteration', async () => {
                const received = []
                for await (const msg of stream) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        break
                    }
                }

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
                expect(onClose).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(0)
            })

            it('closes stream when stream ends during iteration', async () => {
                const received = []
                for await (const msg of stream) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        stream.end()
                    }
                }

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
                expect(onClose).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(0)
            })

            it('closes stream when iterator throws during iteration', async () => {
                const received = []
                const err = new Error('expected err')
                await expect(async () => {
                    for await (const msg of stream) {
                        received.push(msg)
                        if (received.length === MAX_ITEMS) {
                            throw err
                        }
                    }
                }).rejects.toThrow(err)

                expect(received).toEqual(expected.slice(0, MAX_ITEMS))
                expect(onClose).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(0)
            })

            it('closes stream when iterator returns asynchronously', async () => {
                const itr = stream[Symbol.asyncIterator]()
                let receievedAtCallTime
                const received = []
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(() => {
                            receievedAtCallTime = received
                            itr.return()
                        })
                    }
                }

                expect(received).toEqual(receievedAtCallTime)
                expect(onClose).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(0)
            })
        })
    })
})
