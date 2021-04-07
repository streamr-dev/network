import { MessageBuffer } from '../../src/helpers/MessageBuffer'

jest.useFakeTimers()

describe('MessageBuffer', () => {
    test('put, pop and popAll work as expected (no timeouts scenario)', () => {
        const buffer = new MessageBuffer(9999)

        buffer.put('stream-1', {
            id: 'stream-1',
            data: 'hello'
        })
        buffer.put('stream-1', {
            id: 'stream-1',
            data: 'world'
        })
        buffer.put('stream-2', {
            id: 'stream-2',
            data: 'DESTROY!'
        })
        buffer.put('stream-1', {
            id: 'stream-1',
            data: '!'
        })

        expect(buffer.popAll('non-existing-stream')).toEqual([])
        expect(buffer.popAll('stream-1')).toEqual([
            {
                id: 'stream-1',
                data: 'hello'
            },
            {
                id: 'stream-1',
                data: 'world'
            },
            {
                id: 'stream-1',
                data: '!'
            },
        ])
        expect(buffer.popAll('stream-2')).toEqual([
            {
                id: 'stream-2',
                data: 'DESTROY!'
            },
        ])
        expect(buffer.popAll('stream-1')).toEqual([])
    })

    test('timeoutCb(id) is invoked on timeout', () => {
        const timeoutCb = jest.fn()
        const buffer = new MessageBuffer(9999, 1000, timeoutCb)
        buffer.put('stream-id', {})
        jest.runAllTimers()
        expect(timeoutCb).toHaveBeenCalledWith('stream-id')
    })

    test('timeoutCb(id) is not invoked if messages popped before timeout', () => {
        const timeoutCb = jest.fn()
        const buffer = new MessageBuffer(9999, 1000, timeoutCb)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})
        buffer.put('stream-2', {})
        buffer.put('stream-2', {})
        buffer.popAll('stream-1')
        buffer.popAll('stream-2')

        jest.runAllTimers()
        expect(timeoutCb).not.toHaveBeenCalled()
    })

    test('messages are deleted after timeout', () => {
        const buffer = new MessageBuffer(9999)
        buffer.put('stream-1', {})
        buffer.put('stream-2', {})

        jest.runAllTimers()

        expect(buffer.popAll('stream-1')).toEqual([])
        expect(buffer.popAll('stream-2')).toEqual([])
    })

    test('clear() removes all messages and timeout callbacks', () => {
        const timeoutCb = jest.fn()
        const buffer = new MessageBuffer(9999, 100, timeoutCb)
        buffer.put('stream-1', {})
        buffer.put('stream-1', {})
        buffer.put('stream-2', {})
        buffer.put('stream-2', {})

        buffer.clear()
        jest.runAllTimers()

        expect(buffer.popAll('stream-1')).toEqual([])
        expect(buffer.popAll('stream-2')).toEqual([])
        expect(timeoutCb).not.toHaveBeenCalled()
    })

    test('size() gives correct size of buffer across streams', () => {
        const buffer = new MessageBuffer(9999)

        buffer.put('stream-1', {
            id: 'stream-1',
            data: 'hello'
        })
        buffer.put('stream-1', {
            id: 'stream-1',
            data: 'world'
        })
        buffer.put('stream-2', {
            id: 'stream-2',
            data: 'not!'
        })
        buffer.put('stream-1', {
            id: 'stream-1',
            data: '!'
        })

        expect(buffer.size()).toEqual(4)

        buffer.popAll('stream-1')
        expect(buffer.size()).toEqual(1)

        buffer.clear()
        expect(buffer.size()).toEqual(0)
    })

    test('clearing and pushing to ids do not affect other ids', () => {
        const buffer = new MessageBuffer(100)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})

        jest.advanceTimersByTime(50)

        buffer.put('stream-2', {
            a: 'a'
        })
        buffer.put('stream-3', {
            b: 'b'
        })
        buffer.put('stream-3', {
            c: 'c'
        })

        jest.advanceTimersByTime(50)

        expect(buffer.popAll('stream-1')).toEqual([])
        expect(buffer.popAll('stream-2')).toEqual([{
            a: 'a'
        }])
        expect(buffer.popAll('stream-3')).toEqual([
            {
                b: 'b'
            },
            {
                c: 'c'
            }
        ])
    })

    test('only expired messages are deleted on timeout', () => {
        const buffer = new MessageBuffer(100)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})
        buffer.put('stream-1', {})

        jest.advanceTimersByTime(50)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})

        jest.advanceTimersByTime(50) // first 3 messages deleted

        expect(buffer.popAll('stream-1').length).toEqual(2)
    })

    test('maxSize is obeyed', () => {
        const buffer = new MessageBuffer(1000, 3)

        for (let i = 0; i < 20; i++) {
            buffer.put('stream-1', {})
            expect(buffer.size()).toBeLessThanOrEqual(3)
        }
    })
})
