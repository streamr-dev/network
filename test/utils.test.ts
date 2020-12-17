import {
    waitForStreamToEnd,
    callbackToPromise,
    wait,
    toReadableStream,
    waitForEvent,
    waitForCondition,
    eventsToArray, eventsWithArgsToArray
} from "../src/utils"
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
    it('resolves immediately if poll callback returns true from the get-go', (done) => {
        waitForCondition(() => true).then(done)
    })

    it('resolves eventually when poll callback returns true', (done) => {
        let cbReturnValue = false
        setTimeout(() => cbReturnValue = true, 50)
        waitForCondition(() => cbReturnValue, 5000, 10).then(done)
    })

    it('rejects if poll callback does not return true within timeout', (done) => {
        const pollCb = () => false
        waitForCondition(pollCb, 50, 5).catch((err) => {
            expect(err.message).toEqual("waitForCondition: timed out before \"() => false\" became true")
            done()
        })
    })
})

describe(wait, () => {
    it("waits at least the predetermined time", async () => {
        const start = Date.now()
        await wait(10)
        const end = Date.now()
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
            },
            (err) => {
                fail(`Errored ${err}`)
            })
    })

    it("callback error causes returned promise to reject",(done) => {
        const convertedFn = callbackToPromise(sumOfPositives, 1, 5, -666)
        convertedFn.then(
            (value) => {
                fail("should have rejected")
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
