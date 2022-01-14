import { MessageLayer, StreamIDUtils, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { StreamManager } from '../../src/logic/node/StreamManager'

const { MessageID, MessageRef } = MessageLayer

const streamOne = StreamIDUtils.toStreamID('stream-1')
const streamTwo = StreamIDUtils.toStreamID('stream-2')
const streamThree = StreamIDUtils.toStreamID('stream-3')

describe('StreamManager', () => {
    let manager: StreamManager

    beforeEach(() => {
        manager = new StreamManager()
    })

    test('starts out empty', () => {
        expect(manager.isSetUp(StreamPartIDUtils.toStreamPartID(StreamIDUtils.toStreamID('streamId'), 0))).toEqual(false)
        expect(Array.from(manager.getStreamPartIDs())).toEqual([])
    })

    test('setting up streams and testing values', () => {
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamTwo, 0))
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamOne, 1))

        expect(manager.isSetUp(StreamPartIDUtils.toStreamPartID(streamOne, 0))).toEqual(true)
        expect(manager.isSetUp(StreamPartIDUtils.toStreamPartID(streamOne, 1))).toEqual(true)
        expect(manager.isSetUp(StreamPartIDUtils.toStreamPartID(streamTwo, 0))).toEqual(true)

        expect(Array.from(manager.getStreamPartIDs())).toIncludeSameMembers(['stream-1#0', 'stream-1#1', 'stream-2#0'])

        expect(manager.getNeighborsForStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))).toBeEmpty()
        expect(manager.getNeighborsForStream(StreamPartIDUtils.toStreamPartID(streamOne, 1))).toBeEmpty()
        expect(manager.getNeighborsForStream(StreamPartIDUtils.toStreamPartID(streamTwo, 0))).toBeEmpty()
    })

    test('cannot re-setup same stream', () => {
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamThree, 0))

        expect(() => {
            manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamThree, 0))
        }).toThrowError('Stream part stream-3#0 already set up')
    })

    test('can duplicate detect on previously set up stream', () => {
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamThree, 0))

        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageRef(5, 0)
            )
        }).not.toThrowError()
    })

    test('cannot duplicate detect on non-existing stream', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageRef(5, 0)
            )
        }).toThrowError('Stream part stream-3#0 is not set up')
    })

    test('duplicate detection is per publisher, msgChainId', () => {
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamThree, 0))
        manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-1', 'session-1'),
            new MessageRef(5, 0)
        )

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-1', 'session-1'),
            new MessageRef(5, 0)
        )).toEqual(false)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-2', 'session-1'),
            new MessageRef(5, 0)
        )).toEqual(true)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-1', 'session-2'),
            new MessageRef(5, 0)
        )).toEqual(true)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID(toStreamID(streamThree), 0, 10, 0, 'publisher-2', 'session-2'),
            new MessageRef(5, 0)
        )).toEqual(true)
    })

    test('adding neighbor nodes to a set-up stream', () => {
        const streamId = StreamPartIDUtils.toStreamPartID(streamThree, 0)
        const streamId2 = StreamPartIDUtils.toStreamPartID(StreamIDUtils.toStreamID('stream-id-2'), 0)

        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamThree, 0))
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpStream(StreamPartIDUtils.toStreamPartID(StreamIDUtils.toStreamID('stream-id-2'), 0))
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
        const streamId = StreamPartIDUtils.toStreamPartID(streamThree, 0)
        const streamId2 = StreamPartIDUtils.toStreamPartID(StreamIDUtils.toStreamID('stream-id-2'), 0)

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
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamOne, 1))
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamTwo, 0))

        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamOne, 0), 'node')
        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamOne, 0), 'should-not-be-removed')

        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamOne, 1), 'node')
        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamOne, 1), 'should-not-be-removed')

        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamTwo, 0), 'node')
        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamTwo, 0), 'should-not-be-removed')

        manager.removeNodeFromAllStreams('node')

        expect(manager.getNeighborsForStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForStream(StreamPartIDUtils.toStreamPartID(streamOne, 1))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForStream(StreamPartIDUtils.toStreamPartID(streamTwo, 0))).toIncludeSameMembers(['should-not-be-removed'])

        expect(manager.hasNeighbor(StreamPartIDUtils.toStreamPartID(streamOne, 0), 'node')).toEqual(false)
        expect(manager.hasNeighbor(StreamPartIDUtils.toStreamPartID(streamTwo, 0), 'node')).toEqual(false)

        expect(manager.isNodePresent('should-not-be-removed')).toEqual(true)
        expect(manager.isNodePresent('node')).toEqual(false)
    })

    test('remove stream', () => {
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamTwo, 0))

        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamOne, 0), 'n1')

        manager.addNeighbor(StreamPartIDUtils.toStreamPartID(streamTwo, 0), 'n1')

        manager.removeStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))

        expect(manager.isSetUp(StreamPartIDUtils.toStreamPartID(streamOne, 0))).toEqual(false)

        expect(Array.from(manager.getStreamPartIDs())).toEqual(['stream-2#0'])
    })

    test('updating counter', () => {
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamOne, 0))
        manager.setUpStream(StreamPartIDUtils.toStreamPartID(streamTwo, 0))

        manager.updateCounter(StreamPartIDUtils.toStreamPartID(streamOne, 0), 50)
        manager.updateCounter(StreamPartIDUtils.toStreamPartID(streamTwo, 0), 100)
    })
})
