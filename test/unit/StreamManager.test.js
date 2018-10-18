const DataMessage = require('../../src/messages/DataMessage')
const StreamManager = require('../../src/logic/StreamManager')

describe('StreamManager', () => {
    let manager

    beforeEach(() => {
        manager = new StreamManager()
    })

    test('starts out empty', () => {
        expect(manager.isLeaderOf('stream-id')).toEqual(false)
        expect(manager.isOtherNodeLeaderOf('stream-id')).toEqual(false)
        expect(manager.getOwnStreams()).toEqual([])
        expect(manager.getLeaderAddressFor('stream-id')).toBeUndefined()
    })

    test('can mark and query leader\'s streams', () => {
        manager.markCurrentNodeAsLeaderOf('stream-1')
        manager.markCurrentNodeAsLeaderOf('stream-2')

        expect(manager.isLeaderOf('stream-1')).toEqual(true)
        expect(manager.isLeaderOf('stream-2')).toEqual(true)
        expect(manager.getOwnStreams()).toEqual(['stream-1', 'stream-2'])
    })

    test('can mark and query other leaders\' streams', () => {
        manager.markOtherNodeAsLeader('stream-1', '192.168.0.5')
        manager.markOtherNodeAsLeader('stream-2', '192.168.0.6')

        expect(manager.isOtherNodeLeaderOf('stream-1')).toEqual(true)
        expect(manager.isOtherNodeLeaderOf('stream-2')).toEqual(true)
        expect(manager.getLeaderAddressFor('stream-1')).toEqual('192.168.0.5')
        expect(manager.getLeaderAddressFor('stream-2')).toEqual('192.168.0.6')
    })

    test('can mark and query repeater nodes', () => {
        manager.markRepeaterNodes('stream-1', ['192.168.0.1', '192.168.0.2'])
        manager.markRepeaterNodes('stream-2', ['192.168.0.4'])

        expect(manager.isAnyRepeaterKnownFor('stream-1')).toEqual(true)
        expect(manager.isAnyRepeaterKnownFor('stream-2')).toEqual(true)
        expect(manager.isAnyRepeaterKnownFor('non-existing-stream')).toEqual(false)
        expect(manager.getRepeatersFor('stream-1')).toEqual(['192.168.0.1', '192.168.0.2'])
        expect(manager.getRepeatersFor('stream-2')).toEqual(['192.168.0.4'])
        expect(manager.getRepeatersFor('non-existing-stream')).toEqual([])
    })

    test('marking repeater nodes replaces old ones', () => {
        manager.markRepeaterNodes('stream-1', ['192.168.0.1', '192.168.0.2'])
        manager.markRepeaterNodes('stream-1', ['192.168.0.4'])

        expect(manager.getRepeatersFor('stream-1')).toEqual(['192.168.0.4'])
    })

    test('a stream can only have one leader', () => {
        manager.markCurrentNodeAsLeaderOf('stream-id')
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.8')
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.212')

        expect(manager.isLeaderOf('stream-id')).toEqual(false)
        expect(manager.isOtherNodeLeaderOf('stream-id')).toEqual(true)
        expect(manager.getLeaderAddressFor('stream-id')).toEqual('192.168.0.212')
    })

    test('cannot fetch numbers for non-owned stream', () => {
        manager.markOtherNodeAsLeader('stream-id')
        expect(() => manager.fetchNextNumbers('stream-id'))
            .toThrowError('Not leader of stream stream-id')
        expect(() => manager.fetchNextNumbers('non-existing'))
            .toThrowError('Not leader of stream non-existing')
    })

    test('can fetch expected numbers for owned stream', () => {
        manager.markCurrentNodeAsLeaderOf('stream-id')
        expect(manager.fetchNextNumbers('stream-id')).toEqual({
            previousNumber: null,
            number: 1
        })
        expect(manager.fetchNextNumbers('stream-id')).toEqual({
            previousNumber: 1,
            number: 2
        })
        expect(manager.fetchNextNumbers('stream-id')).toEqual({
            previousNumber: 2,
            number: 3
        })
    })

    test('cannot duplicate detect on own stream', () => {
        manager.markCurrentNodeAsLeaderOf('stream-id')
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).toThrowError('Should not be leader of stream stream-id')
    })

    test('cannot duplicate detect on unknown stream', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('unknown-id', {}, 2, 1)
        }).toThrowError('Unknown stream unknown-id')
    })

    test('can duplicate detect on other leader\'s stream', () => {
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.2')
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).not.toThrowError()
    })

    test('can duplicate detect on stream whose repeaters are only known', () => {
        manager.markRepeaterNodes('stream-id', ['192.168.0.2', '192.168.0.4'])
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).not.toThrowError()
    })

    test('can duplicate detect on stream that is no longer own', () => {
        manager.markCurrentNodeAsLeaderOf('stream-id')
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.2')
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).not.toThrowError()
    })

    test('can no longer duplicate detect after becoming leader of stream', () => {
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.2')
        manager.markCurrentNodeAsLeaderOf('stream-id')
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate('stream-id', {}, 2, 1)
        }).toThrowError('Should not be leader of stream stream-id')
    })
})
