import IteratorTest, { expected, MAX_ITEMS } from './IteratorTest'
import { wait } from 'streamr-test-utils'

import { Pipeline, PumpBuffer, PushBuffer } from '../../src/utils/Pipeline'
import { iteratorFinally } from '../../src/utils/iterators'

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

describe('Pipeline', () => {
    let onFinally: () => void
    let onFinallyAfter: () => void

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

    IteratorTest('PipelineBuilder', () => {
        return new Pipeline(generate())
            .pipe(async function* Step(src) {
                yield* src
            })
            .finally(onFinally)
    })

    describe('pipeline', () => {
        describe('baseline', () => {
            IteratorTest('pipeline', () => {
                return new Pipeline(generate())
                    .pipe(async function* Step1(s) {
                        for await (const msg of s) {
                            yield msg * 2
                        }
                    })
                    .pipe(async function* Step2(s) {
                        for await (const msg of s) {
                            yield msg / 2
                        }
                    })
                    .finally(onFinally)
            })
        })

        it('feeds items from one to next', async () => {
            const receivedStep1: number[] = []
            const receivedStep2: number[] = []
            const afterStep1 = jest.fn()
            const afterStep2 = jest.fn()
            const p = new Pipeline(generate())
                .pipe(async function* Step1(s) {
                    try {
                        for await (const msg of s) {
                            receivedStep1.push(msg)
                            yield msg * 2
                        }
                    } finally {
                        afterStep1()
                    }
                })
                .pipe(async function* Step2(s) {
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
                })
                .finally(onFinally)

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
            const receivedStep1: number[] = []
            const receivedStep2: number[] = []
            const afterStep0 = jest.fn()
            const afterStep2 = jest.fn()
            const p = new Pipeline(generate())
                .pipe(async function* Step0(s) {
                    try {
                        yield* s
                    } finally {
                        afterStep0()
                    }
                })
                .pipe(async function* Step1(s) {
                    for await (const msg of s) {
                        receivedStep1.push(msg)
                        yield msg * 2
                        if (receivedStep1.length === MAX_ITEMS) {
                            break
                        }
                    }
                })
                .pipe(async function* Step2(s) {
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
                })
                .finally(onFinally)

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }
            expect(received).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 2))
            expect(receivedStep1).toEqual(expected.slice(0, MAX_ITEMS))
            expect(afterStep0).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
        })

        it('feeds items from one to next, stops all when middle throws', async () => {
            const err = new Error('expected')
            const receivedStep1: number[] = []
            const receivedStep2: number[] = []
            const afterStep0 = jest.fn()
            const afterStep2 = jest.fn()
            const p = new Pipeline(generate())
                .pipe(async function* Step0(s) {
                    try {
                        yield* s
                    } finally {
                        afterStep0()
                    }
                })
                .pipe(async function* Step1(s) {
                    for await (const msg of s) {
                        receivedStep1.push(msg)
                        yield msg * 2
                        if (receivedStep1.length === MAX_ITEMS) {
                            throw err
                        }
                    }
                })
                .pipe(async function* Step2(s) {
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
                })
                .finally(onFinally)

            const received: number[] = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 20))
            expect(receivedStep2).toEqual(expected.slice(0, MAX_ITEMS).map((v) => v * 2))
            expect(receivedStep1).toEqual(expected.slice(0, MAX_ITEMS))
            expect(afterStep0).toHaveBeenCalledTimes(1)
            expect(afterStep2).toHaveBeenCalledTimes(1)
        })

        it('handles errors before', async () => {
            const err = new Error('expected')

            const p = new Pipeline(generate())
                .pipe(async function* Step1(s) {
                    yield* s
                    throw err
                })
                .pipe(async function* Step2(s) {
                    yield* s
                    yield await new Promise<number>(() => {}) // would wait forever
                })
                .finally(onFinally)

            const received: number[] = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected)
        })

        it('handles errors after', async () => {
            const err = new Error('expected')

            const p = new Pipeline(generate())
                .pipe(async function* Step1(s) {
                    yield* s
                })
                .pipe(async function* Step2(s) {
                    yield* s
                    throw err
                })
                .finally(onFinally)

            const received: number[] = []
            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(received).toEqual(expected)
        })

        it('works with PushBuffer inputs', async () => {
            const onFinallyInnerAfter = jest.fn()
            const onFinallyInner = jest.fn(async () => {
                await wait(WAIT)
                onFinallyInnerAfter()
            })
            const inputStream = PumpBuffer(generate())
            const p = new Pipeline(inputStream)
                .pipe(async function* Step1(s) {
                    yield* s
                })
                .pipe(async function* finallyFn(s) {
                    yield* iteratorFinally(s, onFinallyInner)
                })
                .finally(onFinally)

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(onFinallyInner).toHaveBeenCalledTimes(1)
            expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)
            expect(received).toEqual(expected)
        })

        it('works with PushBufferQueue inputs', async () => {
            const onFinallyInnerAfter = jest.fn()
            const onFinallyInner = jest.fn(async () => {
                await wait(WAIT)
                onFinallyInnerAfter()
            })
            const inputStream = new PushBuffer(1)

            setTimeout(async () => {
                for await (const v of generate()) {
                    await inputStream.push(v)
                }
                inputStream.end()
            })

            const p = new Pipeline(inputStream[Symbol.asyncIterator]())
                .pipe(async function* Step1(s) {
                    for await (const v of s) {
                        yield v
                    }
                })
                .pipe(async function* finallyFn(s) {
                    yield* iteratorFinally(s, onFinallyInner)
                })
                .finally(onFinally)

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(onFinallyInner).toHaveBeenCalledTimes(1)
            expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)
            expect(received).toEqual(expected)
        })

        it('works with nested pipelines', async () => {
            const onFinallyInnerAfter = jest.fn()
            const onFinallyInner = jest.fn(async () => {
                await wait(WAIT)
                onFinallyInnerAfter()
            })

            const receivedStep1: number[] = []
            const receivedStep2: number[] = []

            const firstStream = PumpBuffer(generate())
            const p = new Pipeline(firstStream)
                .pipe(async function* Step2(src) {
                    yield* new Pipeline(src)
                        .pipe(async function* Step1(s) {
                            for await (const msg of s) {
                                receivedStep1.push(msg)
                                yield msg
                            }
                        })
                        .finally(onFinallyInner)
                })
                .pipe(async function* Step2(s) {
                    for await (const msg of s) {
                        receivedStep2.push(msg)
                        yield msg
                    }
                })
                .finally(onFinally)

            const received = []
            for await (const msg of p) {
                received.push(msg)
            }

            expect(onFinallyInner).toHaveBeenCalledTimes(1)
            expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)

            expect(received).toEqual(expected)
            expect(receivedStep1).toEqual(expected)
            expect(receivedStep2).toEqual(expected)
        })

        it('works with nested pipelines that throw', async () => {
            const onFinallyInnerAfter = jest.fn()
            const onFinallyInner = jest.fn(async () => {
                await wait(WAIT)
                onFinallyInnerAfter()
            })

            const receivedStep1: number[] = []
            const receivedStep2: number[] = []
            const err = new Error('expected err')

            const firstStream = PumpBuffer(generate())
            const p = new Pipeline(firstStream)
                .pipe(async function* Step2(src) {
                    yield* new Pipeline(src)
                        .pipe(async function* Step1(s) {
                            for await (const msg of s) {
                                receivedStep1.push(msg)
                                yield msg
                                if (receivedStep1.length === MAX_ITEMS) {
                                    throw err
                                }
                            }
                        })
                        .finally(onFinallyInner)
                })
                .pipe(async function* Step2(s) {
                    for await (const msg of s) {
                        receivedStep2.push(msg)
                        yield msg
                    }
                })
                .finally(onFinally)

            const received: number[] = []

            await expect(async () => {
                for await (const msg of p) {
                    received.push(msg)
                }
            }).rejects.toThrow(err)

            expect(onFinallyInner).toHaveBeenCalledTimes(1)
            expect(onFinallyInnerAfter).toHaveBeenCalledTimes(1)

            expect(received).toEqual(expected.slice(0, MAX_ITEMS))
            expect(receivedStep1).toEqual(received)
            expect(receivedStep2).toEqual(received)
        })
    })
})
