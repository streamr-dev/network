import { waitForEvent } from '../src/waitForEvent'
import { EventEmitter } from 'events'

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
