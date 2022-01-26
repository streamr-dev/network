import { MessageLayer, toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { StreamPartManager } from '../../src/logic/node/StreamPartManager'

const { MessageID, MessageRef } = MessageLayer

const streamOne = toStreamID('stream-1')
const streamTwo = toStreamID('stream-2')
const streamThree = toStreamID('stream-3')

describe('StreamPartManager', () => {
    let manager: StreamPartManager

    beforeEach(() => {
        manager = new StreamPartManager()
    })

    test('starts out empty', () => {
        expect(manager.isSetUp(toStreamPartID(toStreamID('streamId'), 0))).toEqual(false)
        expect(Array.from(manager.getStreamParts())).toEqual([])
    })

    test('setting up streams and testing values', () => {
        manager.setUpStreamPart(toStreamPartID(streamOne, 0))
        manager.setUpStreamPart(toStreamPartID(streamTwo, 0))
        manager.setUpStreamPart(toStreamPartID(streamOne, 1))

        expect(manager.isSetUp(toStreamPartID(streamOne, 0))).toEqual(true)
        expect(manager.isSetUp(toStreamPartID(streamOne, 1))).toEqual(true)
        expect(manager.isSetUp(toStreamPartID(streamTwo, 0))).toEqual(true)

        expect(Array.from(manager.getStreamParts())).toIncludeSameMembers(['stream-1#0', 'stream-1#1', 'stream-2#0'])

        expect(manager.getNeighborsForStreamPart(toStreamPartID(streamOne, 0))).toBeEmpty()
        expect(manager.getNeighborsForStreamPart(toStreamPartID(streamOne, 1))).toBeEmpty()
        expect(manager.getNeighborsForStreamPart(toStreamPartID(streamTwo, 0))).toBeEmpty()
    })

    test('cannot re-setup same stream', () => {
        manager.setUpStreamPart(toStreamPartID(streamThree, 0))

        expect(() => {
            manager.setUpStreamPart(toStreamPartID(streamThree, 0))
        }).toThrowError('Stream part stream-3#0 already set up')
    })

    test('can duplicate detect on previously set up stream', () => {
        manager.setUpStreamPart(toStreamPartID(streamThree, 0))

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
        manager.setUpStreamPart(toStreamPartID(streamThree, 0))
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
        const streamId = toStreamPartID(streamThree, 0)
        const streamId2 = toStreamPartID(toStreamID('stream-id-2'), 0)

        manager.setUpStreamPart(toStreamPartID(streamThree, 0))
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpStreamPart(toStreamPartID(toStreamID('stream-id-2'), 0))
        manager.addNeighbor(streamId2, 'node-1')
        manager.addNeighbor(streamId2, 'node-2')
        manager.addNeighbor(streamId2, 'node-3')

        expect(manager.getNeighborsForStreamPart(streamId)).toIncludeSameMembers(['node-1', 'node-2'])
        expect(manager.getNeighborsForStreamPart(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        expect(manager.hasNeighbor(streamId, 'node-1')).toEqual(true)
        expect(manager.hasNeighbor(streamId, 'node-2')).toEqual(true)
        expect(manager.hasNeighbor(streamId, 'node-3')).toEqual(false)

        expect(manager.isNodePresent('node-1')).toEqual(true)
        expect(manager.isNodePresent('node-2')).toEqual(true)
        expect(manager.isNodePresent('node-3')).toEqual(true)
        expect(manager.isNodePresent('node-not-present')).toEqual(false)
    })

    test('removing node from stream removes it from neighbors', () => {
        const streamId = toStreamPartID(streamThree, 0)
        const streamId2 = toStreamPartID(toStreamID('stream-id-2'), 0)

        manager.setUpStreamPart(streamId)
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpStreamPart(streamId2)
        manager.addNeighbor(streamId2, 'node-1')
        manager.addNeighbor(streamId2, 'node-2')
        manager.addNeighbor(streamId2, 'node-3')

        expect(manager.getNeighborsForStreamPart(streamId)).toIncludeSameMembers(['node-1', 'node-2'])
        expect(manager.getNeighborsForStreamPart(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        manager.removeNodeFromStreamPart(streamId, 'node-1')

        expect(manager.getNeighborsForStreamPart(streamId)).toIncludeSameMembers(['node-2'])
        expect(manager.getNeighborsForStreamPart(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        manager.removeNodeFromStreamPart(streamId2, 'node-3')
        expect(manager.getNeighborsForStreamPart(streamId)).toIncludeSameMembers(['node-2'])
        expect(manager.getNeighborsForStreamPart(streamId2)).toIncludeSameMembers(['node-1', 'node-2'])

        expect(manager.getNeighborsForStreamPart(streamId)).toIncludeSameMembers(['node-2'])

        expect(manager.hasNeighbor(streamId, 'node-1')).toEqual(false)
        expect(manager.isNodePresent('node-1')).toEqual(true)

        manager.removeNodeFromStreamPart(streamId2, 'node-1')
        expect(manager.isNodePresent('node-1')).toEqual(false)
    })

    test('remove node from all streams', () => {
        manager.setUpStreamPart(toStreamPartID(streamOne, 0))
        manager.setUpStreamPart(toStreamPartID(streamOne, 1))
        manager.setUpStreamPart(toStreamPartID(streamTwo, 0))

        manager.addNeighbor(toStreamPartID(streamOne, 0), 'node')
        manager.addNeighbor(toStreamPartID(streamOne, 0), 'should-not-be-removed')

        manager.addNeighbor(toStreamPartID(streamOne, 1), 'node')
        manager.addNeighbor(toStreamPartID(streamOne, 1), 'should-not-be-removed')

        manager.addNeighbor(toStreamPartID(streamTwo, 0), 'node')
        manager.addNeighbor(toStreamPartID(streamTwo, 0), 'should-not-be-removed')

        manager.removeNodeFromAllStreamParts('node')

        expect(manager.getNeighborsForStreamPart(toStreamPartID(streamOne, 0))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForStreamPart(toStreamPartID(streamOne, 1))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForStreamPart(toStreamPartID(streamTwo, 0))).toIncludeSameMembers(['should-not-be-removed'])

        expect(manager.hasNeighbor(toStreamPartID(streamOne, 0), 'node')).toEqual(false)
        expect(manager.hasNeighbor(toStreamPartID(streamTwo, 0), 'node')).toEqual(false)

        expect(manager.isNodePresent('should-not-be-removed')).toEqual(true)
        expect(manager.isNodePresent('node')).toEqual(false)
    })

    test('remove stream', () => {
        manager.setUpStreamPart(toStreamPartID(streamOne, 0))
        manager.setUpStreamPart(toStreamPartID(streamTwo, 0))

        manager.addNeighbor(toStreamPartID(streamOne, 0), 'n1')

        manager.addNeighbor(toStreamPartID(streamTwo, 0), 'n1')

        manager.removeStreamPart(toStreamPartID(streamOne, 0))

        expect(manager.isSetUp(toStreamPartID(streamOne, 0))).toEqual(false)

        expect(Array.from(manager.getStreamParts())).toEqual(['stream-2#0'])
    })

    test('updating counter', () => {
        manager.setUpStreamPart(toStreamPartID(streamOne, 0))
        manager.setUpStreamPart(toStreamPartID(streamTwo, 0))

        manager.updateCounter(toStreamPartID(streamOne, 0), 50)
        manager.updateCounter(toStreamPartID(streamTwo, 0), 100)
    })
})
