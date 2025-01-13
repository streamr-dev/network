import { waitForEvent3 } from '../src/waitForEvent3'
import { EventEmitter } from 'eventemitter3'
import { TimeoutError } from '../src/withTimeout'

describe('waitForEvent', () => {
    it('waits for correct event and records the arguments of invocation', async () => {
        interface Events {
            correctEvent: (id: number, name: string) => any
            wrongEvent: (id: number, name: string) => any
        }
        const emitter = new EventEmitter<Events>()
        setTimeout(() => {
            emitter.emit('wrongEvent', 666, 'beast')
        }, 0)
        setTimeout(() => {
            emitter.emit('correctEvent', 1337, 'leet')
        }, 5)
        const recordedArgs = await waitForEvent3(emitter, 'correctEvent')
        expect(recordedArgs).toEqual([1337, 'leet'])
    })

    it('waits for correct filtered event and records the arguments of invocation', async () => {
        interface Events {
            eventName: (id: number, name: string) => any
        }
        const emitter = new EventEmitter<Events>()
        setTimeout(() => {
            emitter.emit('eventName', 666, 'beast')
        }, 0)
        setTimeout(() => {
            emitter.emit('eventName', 1337, 'leet')
        }, 5)
        const recordedArgs = await waitForEvent3(emitter, 'eventName', 100, (value: number) => value > 1000)
        expect(recordedArgs).toEqual([1337, 'leet'])
    })

    it('works on events with zero arguments', async () => {
        interface Events {
            correctEvent: () => any
            wrongEvent: (id: number, name: string) => any
        }
        const emitter = new EventEmitter<Events>()
        setTimeout(() => {
            emitter.emit('wrongEvent', 666, 'beast')
        }, 0)
        setTimeout(() => {
            emitter.emit('correctEvent')
        }, 5)
        const recordedArgs = await waitForEvent3(emitter, 'correctEvent')
        expect(recordedArgs).toEqual([])
    })

    it('rejects if not event occurs within timeout', () => {
        interface Events {
            correctEvent: (id: number, name: string) => any
        }
        const emitter = new EventEmitter<Events>()
        return expect(waitForEvent3(emitter, 'correctEvent', 20)).rejects.toEqual(new TimeoutError(20, 'waitForEvent3'))
    })
})
