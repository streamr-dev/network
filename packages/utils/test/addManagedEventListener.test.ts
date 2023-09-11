import { EventEmitter } from 'eventemitter3'
import { addManagedEventListener } from '../src/addManagedEventListener'

interface Events {
    foo: (x: string, y: number) => void
}

describe('addManagedEventListener', () => {

    it('happy path', () => {
        const abortController = new AbortController()
        const emitter = new EventEmitter<Events>
        const listener = jest.fn()
        addManagedEventListener(
            emitter,
            'foo',
            listener,
            abortController.signal
        )
        emitter.emit('foo', 'bar', 111)
        emitter.emit('foo', 'bar', 222)
        expect(listener).toBeCalledTimes(2)
        expect(listener).toHaveBeenNthCalledWith(1, 'bar', 111)
        expect(listener).toHaveBeenNthCalledWith(2, 'bar', 222)
        abortController.abort()
        emitter.emit('foo', 'bar', 333)
        expect(listener).toBeCalledTimes(2)
    })

    it('already aborted', () => {
        const abortController = new AbortController()
        const emitter = new EventEmitter<Events>
        const listener = jest.fn()
        abortController.abort()
        addManagedEventListener(
            emitter,
            'foo',
            listener,
            abortController.signal
        )
        emitter.emit('foo', 'bar', 111)
        expect(listener).not.toBeCalled()
    })
})
