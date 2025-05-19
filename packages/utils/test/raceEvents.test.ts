import { EventEmitter } from 'eventemitter3'
import { raceEvents } from '../src/raceEvents'

interface Events {
    a: (foo: number, bar: number) => void
    b: (foo: string) => void
    c: () => void
}

describe('raceEvents', () => {

    let eventEmitter: EventEmitter<Events>

    beforeEach(() => {
        eventEmitter = new EventEmitter()
    })

    it('should resolve with the first event that occurs', async () => {
        const promise = raceEvents(eventEmitter, ['a', 'b'])
        setTimeout(() => eventEmitter.emit('a', 123, 456), 100)
        setTimeout(() => eventEmitter.emit('b', 'foo'), 10)
        setTimeout(() => eventEmitter.emit('c'), 50)
        expect(await promise).toEqual({ winnerName: 'b', winnerArgs: ['foo'] })
    })

    it('should resolve with the correct event and arguments', async () => {
        const promise = raceEvents(eventEmitter, ['a', 'b'])
        setTimeout(() => eventEmitter.emit('a', 1, 2), 5)
        expect(await promise).toEqual({ winnerName: 'a', winnerArgs: [1, 2] })
    })

    it('should clean up listeners after resolving', async () => {
        const offFn = jest.spyOn(eventEmitter, 'off')
        const promise = raceEvents(eventEmitter, ['a', 'b'])
        eventEmitter.emit('b', 'payload')
        await promise
        expect(offFn).toHaveBeenCalledTimes(2)
        expect(offFn).toHaveBeenCalledWith('a', expect.any(Function))
        expect(offFn).toHaveBeenCalledWith('b', expect.any(Function))
    })

    it('should not resolve if no event is emitted', async () => {
        const promise = raceEvents(eventEmitter, ['a', 'b'], 50)
        await expect(promise).rejects.toThrow('timed out')
    })
})
