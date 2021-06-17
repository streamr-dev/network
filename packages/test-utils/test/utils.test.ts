import {
    waitForStreamToEnd,
    callbackToPromise,
    wait,
    toReadableStream,
    waitForEvent,
    waitForCondition,
    eventsToArray, eventsWithArgsToArray
} from "../src/utils"
import { performance } from 'perf_hooks'
import { Readable } from "stream"
import { EventEmitter } from "events"

describe(waitForStreamToEnd, () => {
    it("works with empty stream", async () => {
        const rs = toReadableStream()
        const results = await waitForStreamToEnd(rs)
        expect(results).toEqual([])
    })

    it("works with pull-mode stream", async () => {
        const rs = toReadableStream('a', 'b', 'c', 'd', 'e', 'f', 'g')
        const results = await waitForStreamToEnd(rs)
        expect(results).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    })

    it("works with push-mode stream", async () => {
        const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
        const rs = new Readable({
            objectMode: true,
            read(): void {}
        })
        const intervalRef = setInterval(() => {
            if (letters.length !== 0) {
                rs.push(letters.shift())
            } else {
                clearInterval(intervalRef)
                rs.push(null)
            }
        }, 5)

        const results = await waitForStreamToEnd(rs)
        expect(results).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    })

    it("rejects if stream emits error", (done) => {
        const rs = toReadableStream(new Error('error'))
        waitForStreamToEnd(rs).catch((err) => {
            expect(err).toEqual(new Error('error'))
            done()
        })
    })
})

describe(waitForEvent, () => {
    it("waits for correct event and records the arguments of invocation", async () => {
        const emitter = new EventEmitter()
        setTimeout(() => {
            emitter.emit("wrongEvent", 666, "beast")
        }, 0)
        setTimeout(() => {
            emitter.emit("correctEvent", 1337, "leet")
        }, 5)
        const recordedArgs = await waitForEvent(emitter, "correctEvent")
        expect(recordedArgs).toEqual([1337, "leet"])
    })

    it("works on events with zero arguments", async () => {
        const emitter = new EventEmitter()
        setTimeout(() => {
            emitter.emit("wrongEvent", 666, "beast")
        }, 0)
        setTimeout(() => {
            emitter.emit("correctEvent")
        }, 5)
        const recordedArgs = await waitForEvent(emitter, "correctEvent")
        expect(recordedArgs).toEqual([])
    })

    it("rejects if not event occurs within timeout", async () => {
        const emitter = new EventEmitter()
        await waitForEvent(emitter, "correctEvent", 20).catch((err) => {
            expect(err.message).toEqual("Promise timed out after 20 milliseconds")
        })
    })
})

describe(waitForCondition, () => {
    describe('given conditionFn that returns boolean primitives', () => {
        it('resolves immediately if conditionFn returns true from the get-go', (done) => {
            waitForCondition(() => true)
                .then(done)
                .catch(() => done(new Error('timed out')))
        })

        it('resolves eventually when conditionFn returns true', (done) => {
            let cbReturnValue = false
            setTimeout(() => cbReturnValue = true, 50)
            waitForCondition(() => cbReturnValue, 5000, 10)
                .then(done)
                .catch(() => done(new Error('timed out')))
        })

        it('rejects if conditionFn does not return true within timeout', (done) => {
            const pollCb = () => false
            waitForCondition(pollCb, 50, 5).catch((err) => {
                expect(err.message).toEqual("waitForCondition: timed out before \"() => false\" became true")
                done()
            })
        })
    })

    describe('given conditionFn that returns promisified booleans (i.e. Promise<boolean>)', () => {
        it('resolves immediately if conditionFn returns (promisified) true from the get-go', async () => {
            const fn = jest.fn().mockResolvedValue(true)
            await waitForCondition(fn)
            expect(fn).toBeCalledTimes(1)
        })

        it('resolves eventually when conditionFn returns (promisified) true', async () => {
            const fn = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            await waitForCondition(fn)
            expect(fn).toBeCalledTimes(2)
        })

        it('rejects if conditionFn keeps returning (promisified) false within timeout', async () => {
            const fn = () => Promise.resolve(false)
            await expect(waitForCondition(fn, 50, 10)).rejects
                .toThrow("waitForCondition: timed out before \"() => Promise.resolve(false)\" became true")
        })

        it('rejects immediately if conditionFn returns rejected promise from the get-go', async () => {
            const error = new Error('mock')
            await expect(waitForCondition(() => Promise.reject(error))).rejects.toThrow(error)
        })

        it('rejects eventually if conditionFn returns rejected promise and no (promisifed) true was encountered', async () => {
            const error = new Error('mock')
            const fn = jest.fn()
                .mockResolvedValueOnce(false)
                .mockRejectedValueOnce(error)
            await expect(waitForCondition(fn)).rejects.toThrow(error)
        })

        it('rejects if conditionFn returns promise that does not settle within timeout', async () => {
            await expect(waitForCondition(() => new Promise(() => {}), 100, 10)).rejects.toThrow()
        })
    })

    it('can provide contextual information on rejection', (done) => {
        const pollCb = () => false
        waitForCondition(pollCb, 50, 5, () => "a was 5, expected 10").catch((err) => {
            expect(err.message).toEqual("waitForCondition: timed out before \"() => false\" became true" +
                "\na was 5, expected 10")
            done()
        })
    })
})

describe(wait, () => {
    it("waits at least the predetermined time", async () => {
        // use performance.now instead of Date.now
        // Date.now may not be accurate enough for low wait values e.g. 10ms
        const start = performance.now()
        await wait(10)
        const end = performance.now()
        expect(end - start).toBeGreaterThanOrEqual(10)
    })
})

describe(eventsToArray, () => {
    it("collects whitelisted events", () => {
        const emitter = new EventEmitter()
        const array = eventsToArray(emitter, ["eventA", "eventB"])

        expect(array).toEqual([])

        emitter.emit("eventA", 123)
        emitter.emit("eventB", 123)
        emitter.emit("eventB", 123)

        expect(array).toEqual(["eventA", "eventB", "eventB"])

        emitter.emit("eventC", 123)
        emitter.emit("eventD", 123)

        expect(array).toEqual(["eventA", "eventB", "eventB"])

        emitter.emit("eventA", 123)

        expect(array).toEqual(["eventA", "eventB", "eventB", "eventA"])
    })
})

describe(eventsWithArgsToArray, () => {
    it("collects whitelisted events and the invocations' arguments", () => {
        const emitter = new EventEmitter()
        const array = eventsWithArgsToArray(emitter, ["eventA", "eventB"])

        expect(array).toEqual([])

        emitter.emit("eventA", 123)
        emitter.emit("eventB", "hello")
        emitter.emit("eventB", "world")

        expect(array).toEqual([
            ["eventA", 123],
            ["eventB", "hello"],
            ["eventB", "world"]
        ])

        emitter.emit("eventC", 666)
        emitter.emit("eventD", 999)

        expect(array).toEqual([
            ["eventA", 123],
            ["eventB", "hello"],
            ["eventB", "world"]
        ])

        emitter.emit("eventA", 256, 512, "!")

        expect(array).toEqual([
            ["eventA", 123],
            ["eventB", "hello"],
            ["eventB", "world"],
            ["eventA", 256, 512, "!"],
        ])
    })
})

describe(callbackToPromise, () => {
    function sumOfPositives(
        a: number,
        b: number,
        c: number,
        cb: (err: Error | null, result: number | null) => void
    ): void {
        if (a < 0 || b < 0 || c < 0) {
            cb(new Error("one of inputs was negative!"), null)
        } else {
            cb(null, a + b + c)
        }
    }

    it("converts a typical callback-pattern function to one that returns a promise",(done) => {
        const convertedFn = callbackToPromise(sumOfPositives, 1, 5, 10)
        convertedFn.then(
            (value) => {
                expect(value).toEqual(16)
                done()
                return true
            },
            (err) => {
                fail(`Errored ${err}`)
            })
    })

    it("callback error causes returned promise to reject",(done) => {
        const convertedFn = callbackToPromise(sumOfPositives, 1, 5, -666)
        convertedFn.then(
            (_value) => {
                fail("should have rejected")
                return true
            },
            (err) => {
                expect(err).toEqual(new Error("one of inputs was negative!"))
                done()
            })
    })

    it('zero-argument case', async () => {
        function doSomething(cb: (err: null, result: number | null) => void): void {
            setTimeout(() => cb(null, 1337), 0)
        }
        const result = await callbackToPromise(doSomething)
        expect(result).toEqual(1337)
    })
})

describe(toReadableStream, () => {
    it("empty array case", (done) => {
        const readable = toReadableStream()
        const dataPoints: any[] = []
        readable.on("data", (data) => dataPoints.push(data))
        readable.once("error", () => fail("should not have errored"))
        readable.once("end", () => {
            expect(dataPoints).toEqual([])
            done()
        })
    })

    it("multiple successful values", (done) => {
        const readable = toReadableStream("hello", 666, "world")
        const dataPoints: any[] = []
        readable.on("data", (data) => dataPoints.push(data))
        readable.once("error", () => fail("should not have errored"))
        readable.once("end", () => {
            expect(dataPoints).toEqual([
                "hello",
                666,
                "world"
            ])
            done()
        })
    })

    it("error case", (done) => {
        const readable = toReadableStream("hello", "you", "sweet", "large", new Error("error"), "world", "!")
        const dataPoints: any[] = []
        readable.on("data", (data) => dataPoints.push(data))
        readable.once("error", (err) => {
            expect(err).toEqual(new Error("error"))
            expect(dataPoints).toEqual(["hello", "you", "sweet"])
            done()
        })
        readable.once("end", () => {
            fail("should not hit 'end' event")
        })
    })
})
