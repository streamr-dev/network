import { EventEmitter } from 'eventemitter3'
import { addManagedEventListener } from '../src/addManagedEventListener'

interface Events {
    foo: (x: string, y: number) => void
    bar: (x: number) => void
}

describe('addManagedEventListener', () => {
    it('happy path', () => {
        const abortController = new AbortController()
        const emitter = new EventEmitter<Events>()
        const listener = jest.fn()
        addManagedEventListener(emitter, 'foo', listener, abortController.signal)
        emitter.emit('foo', 'abc', 111)
        emitter.emit('foo', 'abc', 222)
        expect(listener).toHaveBeenCalledTimes(2)
        expect(listener).toHaveBeenNthCalledWith(1, 'abc', 111)
        expect(listener).toHaveBeenNthCalledWith(2, 'abc', 222)
        abortController.abort()
        emitter.emit('foo', 'abc', 333)
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('already aborted', () => {
        const abortController = new AbortController()
        const emitter = new EventEmitter<Events>()
        const listener = jest.fn()
        abortController.abort()
        addManagedEventListener(emitter, 'foo', listener, abortController.signal)
        emitter.emit('foo', 'abc', 111)
        expect(listener).not.toHaveBeenCalled()
    })
})
