const { wait } = require('streamr-test-utils')

const MessageBuffer = require('../../src/helpers/MessageBuffer')

describe('fullt test of MessageBuffer', () => {
    test('put, pop and popAll work as expected (no timeouts scenario)', () => {
        const buffer = new MessageBuffer(999999999)

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

    test('timeoutCb(id) is not invoked if messages popped before timeout', () => {
        const timeoutCb = jest.fn()
        const buffer = new MessageBuffer(1000, 1000, timeoutCb)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})
        buffer.put('stream-2', {})
        buffer.put('stream-2', {})
        buffer.popAll('stream-1')
        buffer.popAll('stream-2')
    })

    test('messages are deleted after timeout', (done) => {
        const buffer = new MessageBuffer(100)
        buffer.put('stream-1', {})
        buffer.put('stream-2', {})

        setTimeout(() => {
            expect(buffer.popAll('stream-1')).toEqual([])
            expect(buffer.popAll('stream-2')).toEqual([])
            done()
        }, 101)
    })

    test('clear() removes all messages and timeout callbacks', () => {
        const buffer = new MessageBuffer(100, 100)
        buffer.put('stream-1', {})
        buffer.put('stream-1', {})
        buffer.put('stream-2', {})
        buffer.put('stream-2', {})

        buffer.clear()

        expect(buffer.popAll('stream-1')).toEqual([])
        expect(buffer.popAll('stream-2')).toEqual([])
    })

    test('size() gives correct size of buffer across streams', () => {
        const buffer = new MessageBuffer(999999999)

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

    test('clearing and pushing to ids do not affect other ids', async () => {
        const buffer = new MessageBuffer(100)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})

        await wait(51)

        buffer.put('stream-2', {
            a: 'a'
        })
        buffer.put('stream-3', {
            b: 'b'
        })
        buffer.put('stream-3', {
            c: 'c'
        })

        await wait(51)

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

    test('only expired messages are deleted on timeout', async () => {
        const buffer = new MessageBuffer(100)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})
        buffer.put('stream-1', {})

        await wait(51)

        buffer.put('stream-1', {})
        buffer.put('stream-1', {})

        await wait(51) // first 3 messages deleted

        expect(buffer.popAll('stream-1').length).toEqual(2)
    })

    test('test maxLimit', () => {
        const buffer = new MessageBuffer(1000, 3)

        for (let i = 0; i < 1000; i++) {
            buffer.put('stream-1', {})
        }

        expect(buffer.popAll('stream-1').length).toEqual(3)
    })
})
