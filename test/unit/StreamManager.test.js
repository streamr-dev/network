const StreamManager = require('../../src/logic/StreamManager')

describe('StreamManager', () => {
    let manager

    beforeEach(() => {
        manager = new StreamManager()
    })

    test('starts out empty', () => {
        expect(manager.isOwnStream('stream-id')).toEqual(false)
        expect(manager.isKnownStream('stream-id')).toEqual(false)
        expect(manager.getOwnStreams()).toEqual([])
        expect(manager.getNodesForKnownStream('stream-id')).toEqual([])
    })

    test('can mark and query own streams', () => {
        manager.markOwnStream('stream-1')
        manager.markOwnStream('stream-2')

        expect(manager.isOwnStream('stream-1')).toEqual(true)
        expect(manager.isOwnStream('stream-2')).toEqual(true)
        expect(manager.getOwnStreams()).toEqual(['stream-1', 'stream-2'])
    })

    test('can mark and query known streams (and nodes)', () => {
        manager.markKnownStream('stream-1', ['192.168.0.1', '192.168.0.2'])
        manager.markKnownStream('stream-2', ['192.168.0.4'])

        expect(manager.isKnownStream('stream-1')).toEqual(true)
        expect(manager.isKnownStream('stream-2')).toEqual(true)
        expect(manager.isKnownStream('non-existing-stream')).toEqual(false)
        expect(manager.getNodesForKnownStream('stream-1')).toEqual(['192.168.0.1', '192.168.0.2'])
        expect(manager.getNodesForKnownStream('stream-2')).toEqual(['192.168.0.4'])
        expect(manager.getNodesForKnownStream('non-existing-stream')).toEqual([])
    })

    test('marking known streams (and nodes) replaces old ones', () => {
        manager.markKnownStream('stream-1', ['192.168.0.1', '192.168.0.2'])
        manager.markKnownStream('stream-1', ['192.168.0.4'])

        expect(manager.getNodesForKnownStream('stream-1')).toEqual(['192.168.0.4'])
    })

    test('cannot duplicate detect on non-own stream', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).toThrowError('Not own stream stream-id')
    })

    test('cannot duplicate detect on only known stream', () => {
        manager.markKnownStream('stream-id', ['192.168.0.2'])
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).toThrowError('Not own stream stream-id')
    })

    test('can duplicate detect on own stream', () => {
        manager.markOwnStream('stream-id')
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).not.toThrowError()
    })
})
