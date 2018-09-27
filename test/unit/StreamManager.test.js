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

    test('a stream can only have one leader', () => {
        manager.markCurrentNodeAsLeaderOf('stream-id')
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.8')
        manager.markOtherNodeAsLeader('stream-id', '192.168.0.212')

        expect(manager.isLeaderOf('stream-id')).toEqual(false)
        expect(manager.isOtherNodeLeaderOf('stream-id')).toEqual(true)
        expect(manager.getLeaderAddressFor('stream-id')).toEqual('192.168.0.212')
    })
})
