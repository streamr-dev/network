import { waitForEvent } from '../src/waitForEvent'
import { EventEmitter } from 'events'
import { TimeoutError } from '../src/withTimeout'

describe('waitForEvent', () => {
    it('waits for correct event and records the arguments of invocation', async () => {
        const emitter = new EventEmitter()
        setTimeout(() => {
            emitter.emit('wrongEvent', 666, 'beast')
        }, 0)
        setTimeout(() => {
            emitter.emit('correctEvent', 1337, 'leet')
        }, 5)
        const recordedArgs = await waitForEvent(emitter, 'correctEvent')
        expect(recordedArgs).toEqual([1337, 'leet'])
    })

    it('waits for correct filtered event and records the arguments of invocation', async () => {
        const emitter = new EventEmitter()
        setTimeout(() => {
            emitter.emit('eventName', 666, 'beast')
        }, 0)
        setTimeout(() => {
            emitter.emit('eventName', 1337, 'leet')
        }, 5)
        const recordedArgs = await waitForEvent(emitter, 'eventName', 100, (value: number) => value > 1000)
        expect(recordedArgs).toEqual([1337, 'leet'])
    })

    it('works on events with zero arguments', async () => {
        const emitter = new EventEmitter()
        setTimeout(() => {
            emitter.emit('wrongEvent', 666, 'beast')
        }, 0)
        setTimeout(() => {
            emitter.emit('correctEvent')
        }, 5)
        const recordedArgs = await waitForEvent(emitter, 'correctEvent')
        expect(recordedArgs).toEqual([])
    })

    it('rejects if not event occurs within timeout', () => {
        const emitter = new EventEmitter()
        return expect(waitForEvent(emitter, 'correctEvent', 20)).rejects.toEqual(new TimeoutError(20, 'waitForEvent'))
    })
})
