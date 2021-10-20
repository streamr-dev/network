import { MessageLayer } from 'streamr-client-protocol'

import { StreamManager } from '../../src/logic/node/StreamManager'
import { StreamIdAndPartition } from '../../src/identifiers'

const { MessageID, MessageRef } = MessageLayer

describe('StreamManager', () => {
    let manager: StreamManager

    beforeEach(() => {
        manager = new StreamManager()
    })

    test('starts out empty', () => {
        expect(manager.isSetUp(new StreamIdAndPartition('streamId', 0))).toEqual(false)
        expect(manager.getStreams()).toEqual([])
        expect(manager.getStreamsAsKeys()).toEqual([])
    })

    test('setting up streams and testing values', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-1', 1))

        expect(manager.isSetUp(new StreamIdAndPartition('stream-1', 0))).toEqual(true)
        expect(manager.isSetUp(new StreamIdAndPartition('stream-1', 1))).toEqual(true)
        expect(manager.isSetUp(new StreamIdAndPartition('stream-2', 0))).toEqual(true)

        expect(manager.getStreams()).toEqual([
            new StreamIdAndPartition('stream-1', 0),
            new StreamIdAndPartition('stream-1', 1),
            new StreamIdAndPartition('stream-2', 0)
        ])
        expect(manager.getStreamsAsKeys()).toEqual(['stream-1::0', 'stream-1::1', 'stream-2::0'])

        expect(manager.getNeighborsForStream(new StreamIdAndPartition('stream-1', 0))).toBeEmpty()
        expect(manager.getNeighborsForStream(new StreamIdAndPartition('stream-1', 1))).toBeEmpty()
        expect(manager.getNeighborsForStream(new StreamIdAndPartition('stream-2', 0))).toBeEmpty()
    })

    test('cannot re-setup same stream', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-id', 0))

        expect(() => {
            manager.setUpStream(new StreamIdAndPartition('stream-id', 0))
        }).toThrowError('Stream stream-id::0 already set up')
    })

    test('can duplicate detect on previously set up stream', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-id', 0))

        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID('stream-id', 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageRef(5, 0)
            )
        }).not.toThrowError()
    })

    test('cannot duplicate detect on non-existing stream', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID('stream-id', 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageRef(5, 0)
            )
        }).toThrowError('Stream stream-id::0 is not set up')
    })

    test('duplicate detection is per publisher, msgChainId', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-id', 0))
        manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-1', 'session-1'),
            new MessageRef(5, 0)
        )

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-1', 'session-1'),
            new MessageRef(5, 0)
        )).toEqual(false)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-2', 'session-1'),
            new MessageRef(5, 0)
        )).toEqual(true)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-1', 'session-2'),
            new MessageRef(5, 0)
        )).toEqual(true)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-2', 'session-2'),
            new MessageRef(5, 0)
        )).toEqual(true)
    })

    test('adding neighbor nodes to a set-up stream', () => {
        const streamId = new StreamIdAndPartition('stream-id', 0)
        const streamId2 = new StreamIdAndPartition('stream-id-2', 0)

        manager.setUpStream(new StreamIdAndPartition('stream-id', 0))
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpStream(new StreamIdAndPartition('stream-id-2', 0))
        manager.addNeighbor(streamId2, 'node-1')
        manager.addNeighbor(streamId2, 'node-2')
        manager.addNeighbor(streamId2, 'node-3')

        expect(manager.getNeighborsForStream(streamId)).toIncludeSameMembers(['node-1', 'node-2'])
        expect(manager.getNeighborsForStream(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        expect(manager.hasNeighbor(streamId, 'node-1')).toEqual(true)
        expect(manager.hasNeighbor(streamId, 'node-2')).toEqual(true)
        expect(manager.hasNeighbor(streamId, 'node-3')).toEqual(false)

        expect(manager.isNodePresent('node-1')).toEqual(true)
        expect(manager.isNodePresent('node-2')).toEqual(true)
        expect(manager.isNodePresent('node-3')).toEqual(true)
        expect(manager.isNodePresent('node-not-present')).toEqual(false)
    })

    test('removing node from stream removes it from neighbors', () => {
        const streamId = new StreamIdAndPartition('stream-id', 0)
        const streamId2 = new StreamIdAndPartition('stream-id-2', 0)

        manager.setUpStream(streamId)
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpStream(streamId2)
        manager.addNeighbor(streamId2, 'node-1')
        manager.addNeighbor(streamId2, 'node-2')
        manager.addNeighbor(streamId2, 'node-3')

        expect(manager.getNeighborsForStream(streamId)).toIncludeSameMembers(['node-1', 'node-2'])
        expect(manager.getNeighborsForStream(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        manager.removeNodeFromStream(streamId, 'node-1')

        expect(manager.getNeighborsForStream(streamId)).toIncludeSameMembers(['node-2'])
        expect(manager.getNeighborsForStream(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        manager.removeNodeFromStream(streamId2, 'node-3')
        expect(manager.getNeighborsForStream(streamId)).toIncludeSameMembers(['node-2'])
        expect(manager.getNeighborsForStream(streamId2)).toIncludeSameMembers(['node-1', 'node-2'])

        expect(manager.getNeighborsForStream(streamId)).toIncludeSameMembers(['node-2'])

        expect(manager.hasNeighbor(streamId, 'node-1')).toEqual(false)
        expect(manager.isNodePresent('node-1')).toEqual(true)

        manager.removeNodeFromStream(streamId2, 'node-1')
        expect(manager.isNodePresent('node-1')).toEqual(false)
    })

    test('remove node from all streams', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-1', 1))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))

        manager.addNeighbor(new StreamIdAndPartition('stream-1', 0), 'node')
        manager.addNeighbor(new StreamIdAndPartition('stream-1', 0), 'should-not-be-removed')

        manager.addNeighbor(new StreamIdAndPartition('stream-1', 1), 'node')
        manager.addNeighbor(new StreamIdAndPartition('stream-1', 1), 'should-not-be-removed')

        manager.addNeighbor(new StreamIdAndPartition('stream-2', 0), 'node')
        manager.addNeighbor(new StreamIdAndPartition('stream-2', 0), 'should-not-be-removed')

        manager.removeNodeFromAllStreams('node')

        expect(manager.getNeighborsForStream(new StreamIdAndPartition('stream-1', 0))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForStream(new StreamIdAndPartition('stream-1', 1))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForStream(new StreamIdAndPartition('stream-2', 0))).toIncludeSameMembers(['should-not-be-removed'])

        expect(manager.hasNeighbor(new StreamIdAndPartition('stream-1', 0), 'node')).toEqual(false)
        expect(manager.hasNeighbor(new StreamIdAndPartition('stream-2', 0), 'node')).toEqual(false)

        expect(manager.isNodePresent('should-not-be-removed')).toEqual(true)
        expect(manager.isNodePresent('node')).toEqual(false)
    })

    test('remove stream', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))

        manager.addNeighbor(new StreamIdAndPartition('stream-1', 0), 'n1')

        manager.addNeighbor(new StreamIdAndPartition('stream-2', 0), 'n1')

        manager.removeStream(new StreamIdAndPartition('stream-1', 0))

        expect(manager.isSetUp(new StreamIdAndPartition('stream-1', 0))).toEqual(false)

        expect(manager.getStreams()).toEqual([
            new StreamIdAndPartition('stream-2', 0)
        ])
    })

    test('updating counter', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))

        manager.updateCounter(new StreamIdAndPartition('stream-1', 0), 50)
        manager.updateCounter(new StreamIdAndPartition('stream-2', 0), 100)
    })
})
