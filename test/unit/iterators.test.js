import { Readable, PassThrough } from 'stream'

import { wait } from 'streamr-test-utils'

import { iteratorFinally, CancelableIterator, pipeline } from '../../src/iterators'
import { Defer } from '../../src/utils'

const expected = [1, 2, 3, 4, 5, 6, 7]

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

describe('Iterator Utils', () => {
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
                    break
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
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
            const itr = iteratorFinally(generate(), onFinally)
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        itr.return()
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
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

        it('runs fn once', async () => {
            const received = []
            const itr = iteratorFinally(generate(), onFinally)

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    await Promise.all([
                        itr.return(),
                        itr.return(),
                    ])
                    break
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })
    })

    describe('CancelableIterator', () => {
        it('runs fn when iterator complete', async () => {
            const received = []
            for await (const msg of CancelableIterator(generate())) {
                received.push(msg)
            }
            expect(received).toEqual(expected)
        })

        it('can cancel during iteration', async () => {
            const itr = CancelableIterator(generate())
            const received = []
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    itr.cancel()
                }
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
        })

        it('cancels when iterator.cancel() is called asynchronously', async () => {
            const received = []
            const itr = CancelableIterator(generate())
            let receievedAtCallTime
            for await (const msg of itr) {
                received.push(msg)
                if (received.length === MAX_ITEMS) {
                    // eslint-disable-next-line no-loop-func
                    setTimeout(() => {
                        receievedAtCallTime = received
                        itr.cancel()
                    })
                }
            }
            expect(received).toEqual(receievedAtCallTime)
        })

        it('interrupts outstanding .next call', async () => {
            const received = []
            const itr = CancelableIterator(async function* Gen() {
                yield* expected
                yield await new Promise(() => {}) // would wait forever
            }())

            for await (const msg of itr) {
                received.push(msg)
                if (received.length === expected.length) {
                    // eslint-disable-next-line no-loop-func
                    setTimeout(() => {
                        itr.cancel()
                    })
                }
            }
            expect(received).toEqual(expected)
        })

        it('interrupts outstanding .next call with error', async () => {
            const received = []
            const itr = CancelableIterator(async function* Gen() {
                yield* expected
                yield await new Promise(() => {}) // would wait forever
            }())

            const err = new Error('expected')

            let receievedAtCallTime
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(() => {
                            receievedAtCallTime = received
                            itr.cancel(err)
                        })
                    }
                }
            }).rejects.toThrow(err)
            expect(received).toEqual(receievedAtCallTime)
        })

        it('ignores err if cancelled', async () => {
            const received = []
            const err = new Error('should not see this')
            const d = Defer()
            const itr = CancelableIterator(async function* Gen() {
                yield* expected
                await wait(WAIT * 2)
                d.resolve()
                throw err
            }())

            let receievedAtCallTime
            await expect(async () => {
                for await (const msg of itr) {
                    received.push(msg)
                    if (received.length === MAX_ITEMS) {
                        // eslint-disable-next-line no-loop-func
                        setTimeout(() => {
                            receievedAtCallTime = received
                            itr.cancel(err)
                        })
                    }
                }
            }).rejects.toThrow(err)
            await d
            await wait(WAIT * 2)
            expect(received).toEqual(receievedAtCallTime)
        })
    })

    describe('pipeline', () => {
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
                        afterStep2()
                    }
                }
            )

            const received = []
            for await (const msg of p) {
                received.push(msg)
                if (received.length === expected.length) {
                    break
                }
            }
            await wait(100)
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
            await wait(100)
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
            await wait(100)
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
            await wait(100)
            expect(received).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 2))
            expect(receivedStep1).toEqual(expected.slice(0, MAX_ITEMS))
            expect(afterStep1).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
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
                expected.forEach((item) => {
                    stream.write(item)
                })
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
                expected.forEach((item) => {
                    stream.write(item)
                })
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

            it('closes stream when iterator throws during iteration', async () => {
                expected.forEach((item) => {
                    stream.write(item)
                })
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
                expected.forEach((item) => {
                    stream.write(item)
                })
                const received = []
                const itr = stream[Symbol.asyncIterator]()
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
                }
                expect(received).toEqual(receievedAtCallTime)
                expect(onClose).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(0)
            })
        })
    })
})

