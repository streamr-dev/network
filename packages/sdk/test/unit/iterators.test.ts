import { Defer, wait } from '@streamr/utils'
import { iteratorFinally, nextValue } from '../../src/utils/iterators'
import { expected, MAX_ITEMS, IteratorTest } from './IteratorTest'

const WAIT = 20

async function* generate(items = expected, waitTime = WAIT) {
    await wait(waitTime * 0.1)
    for (const item of items) {
        await wait(waitTime * 0.1)
        yield item
        await wait(waitTime * 0.1)
    }
    await wait(waitTime * 0.1)
}

// eslint-disable-next-line @typescript-eslint/default-param-last
async function* generateThrow(items = expected, { max = MAX_ITEMS, err = new Error('expected') }) {
    let index = 0
    await wait(WAIT * 0.1)
    for (const item of items) {
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
            const done = new Defer()
            try {
                const received: number[] = []
                const itr = iteratorFinally(generate(), onFinally)
                const onTimeoutReached = jest.fn()
                let receievedAtCallTime
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        setTimeout(
                            done.wrap(() => {
                                onTimeoutReached()
                                receievedAtCallTime = received
                                itr.return(undefined)
                            })
                        )
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

        it('runs fn when iterator returns before iteration (explicit return)', async () => {
            const received: number[] = []
            const onStarted = jest.fn()
            const itr = iteratorFinally(
                (async function* Test() {
                    onStarted()
                    yield* generate()
                })(),
                async () => {
                    await wait(WAIT * 5)
                    await onFinally()
                }
            )
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
            const itr = iteratorFinally(
                generateThrow(expected, {
                    err
                }),
                onFinally
            )
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
                const itr = iteratorFinally(
                    (async function* Outer() {
                        for await (const msg of innerItr) {
                            yield msg
                            if (received.length === MAX_ITEMS) {
                                throw err
                            }
                        }
                    })(),
                    onFinally
                )

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
                const itrInner = iteratorFinally(
                    (async function* Outer() {
                        for await (const msg of generate()) {
                            yield msg
                            if (received.length === MAX_ITEMS) {
                                throw err
                            }
                        }
                    })(),
                    onFinallyInner
                )
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
})

describe('nextValue', () => {
    it('happy path', async () => {
        const generator = (async function* () {
            yield 1
            yield 2
        })()
        expect(await nextValue(generator)).toBe(1)
        expect(await nextValue(generator)).toBe(2)
        expect(await nextValue(generator)).toBe(undefined)
    })

    it('return value', async () => {
        const generator = (async function* () {
            yield 1
            return 2
        })()
        expect(await nextValue(generator)).toBe(1)
        expect(await nextValue(generator)).toBe(2)
        expect(await nextValue(generator)).toBe(undefined)
    })

    it('empty', async () => {
        const generator: AsyncGenerator<number, any, any> = (async function* () {})()
        expect(await nextValue(generator)).toBe(undefined)
    })
})
