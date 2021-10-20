import { MessageLayer, SPID } from 'streamr-client-protocol'
import { SPIDManager } from '../../src/logic/node/SPIDManager'

const { MessageID, MessageRef } = MessageLayer

describe('SPIDManager', () => {
    let manager: SPIDManager

    beforeEach(() => {
        manager = new SPIDManager()
    })

    test('starts out empty', () => {
        expect(manager.isSetUp(new SPID('streamId', 0))).toEqual(false)
        expect(Array.from(manager.getSPIDKeys())).toEqual([])
    })

    test('setting up SPIDs and testing values', () => {
        manager.setUpSPID(new SPID('stream-1', 0))
        manager.setUpSPID(new SPID('stream-2', 0))
        manager.setUpSPID(new SPID('stream-1', 1))

        expect(manager.isSetUp(new SPID('stream-1', 0))).toEqual(true)
        expect(manager.isSetUp(new SPID('stream-1', 1))).toEqual(true)
        expect(manager.isSetUp(new SPID('stream-2', 0))).toEqual(true)

        expect(Array.from(manager.getSPIDKeys())).toIncludeSameMembers(['stream-1#0', 'stream-1#1', 'stream-2#0'])

        expect(manager.getNeighborsForSPID(new SPID('stream-1', 0))).toBeEmpty()
        expect(manager.getNeighborsForSPID(new SPID('stream-1', 1))).toBeEmpty()
        expect(manager.getNeighborsForSPID(new SPID('stream-2', 0))).toBeEmpty()
    })

    test('cannot re-setup same SPID', () => {
        manager.setUpSPID(new SPID('stream-id', 0))

        expect(() => {
            manager.setUpSPID(new SPID('stream-id', 0))
        }).toThrowError('Stream partition stream-id#0 already set up')
    })

    test('can duplicate detect on previously set up SPID', () => {
        manager.setUpSPID(new SPID('stream-id', 0))

        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID('stream-id', 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageRef(5, 0)
            )
        }).not.toThrowError()
    })

    test('cannot duplicate detect on non-existing SPID', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID('stream-id', 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageRef(5, 0)
            )
        }).toThrowError('Stream partition stream-id#0 is not set up')
    })

    test('duplicate detection is per publisher, msgChainId', () => {
        manager.setUpSPID(new SPID('stream-id', 0))
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

    test('adding neighbor nodes to a set-up SPID', () => {
        const streamId = new SPID('stream-id', 0)
        const streamId2 = new SPID('stream-id-2', 0)

        manager.setUpSPID(new SPID('stream-id', 0))
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpSPID(new SPID('stream-id-2', 0))
        manager.addNeighbor(streamId2, 'node-1')
        manager.addNeighbor(streamId2, 'node-2')
        manager.addNeighbor(streamId2, 'node-3')

        expect(manager.getNeighborsForSPID(streamId)).toIncludeSameMembers(['node-1', 'node-2'])
        expect(manager.getNeighborsForSPID(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        expect(manager.hasNeighbor(streamId, 'node-1')).toEqual(true)
        expect(manager.hasNeighbor(streamId, 'node-2')).toEqual(true)
        expect(manager.hasNeighbor(streamId, 'node-3')).toEqual(false)

        expect(manager.isNodePresent('node-1')).toEqual(true)
        expect(manager.isNodePresent('node-2')).toEqual(true)
        expect(manager.isNodePresent('node-3')).toEqual(true)
        expect(manager.isNodePresent('node-not-present')).toEqual(false)
    })

    test('removing node from SPID removes it from neighbors', () => {
        const streamId = new SPID('stream-id', 0)
        const streamId2 = new SPID('stream-id-2', 0)

        manager.setUpSPID(streamId)
        manager.addNeighbor(streamId, 'node-1')
        manager.addNeighbor(streamId, 'node-2')

        manager.setUpSPID(streamId2)
        manager.addNeighbor(streamId2, 'node-1')
        manager.addNeighbor(streamId2, 'node-2')
        manager.addNeighbor(streamId2, 'node-3')

        expect(manager.getNeighborsForSPID(streamId)).toIncludeSameMembers(['node-1', 'node-2'])
        expect(manager.getNeighborsForSPID(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        manager.removeNeighbor(streamId, 'node-1')

        expect(manager.getNeighborsForSPID(streamId)).toIncludeSameMembers(['node-2'])
        expect(manager.getNeighborsForSPID(streamId2)).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        manager.removeNeighbor(streamId2, 'node-3')
        expect(manager.getNeighborsForSPID(streamId)).toIncludeSameMembers(['node-2'])
        expect(manager.getNeighborsForSPID(streamId2)).toIncludeSameMembers(['node-1', 'node-2'])

        expect(manager.getNeighborsForSPID(streamId)).toIncludeSameMembers(['node-2'])

        expect(manager.hasNeighbor(streamId, 'node-1')).toEqual(false)
        expect(manager.isNodePresent('node-1')).toEqual(true)

        manager.removeNeighbor(streamId2, 'node-1')
        expect(manager.isNodePresent('node-1')).toEqual(false)
    })

    test('remove node from all SPIDs', () => {
        manager.setUpSPID(new SPID('stream-1', 0))
        manager.setUpSPID(new SPID('stream-1', 1))
        manager.setUpSPID(new SPID('stream-2', 0))

        manager.addNeighbor(new SPID('stream-1', 0), 'node')
        manager.addNeighbor(new SPID('stream-1', 0), 'should-not-be-removed')

        manager.addNeighbor(new SPID('stream-1', 1), 'node')
        manager.addNeighbor(new SPID('stream-1', 1), 'should-not-be-removed')

        manager.addNeighbor(new SPID('stream-2', 0), 'node')
        manager.addNeighbor(new SPID('stream-2', 0), 'should-not-be-removed')

        manager.removeNodeFromAllSPIDs('node')

        expect(manager.getNeighborsForSPID(new SPID('stream-1', 0))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForSPID(new SPID('stream-1', 1))).toIncludeSameMembers(['should-not-be-removed'])
        expect(manager.getNeighborsForSPID(new SPID('stream-2', 0))).toIncludeSameMembers(['should-not-be-removed'])

        expect(manager.hasNeighbor(new SPID('stream-1', 0), 'node')).toEqual(false)
        expect(manager.hasNeighbor(new SPID('stream-2', 0), 'node')).toEqual(false)

        expect(manager.isNodePresent('should-not-be-removed')).toEqual(true)
        expect(manager.isNodePresent('node')).toEqual(false)
    })

    test('remove SPID', () => {
        manager.setUpSPID(new SPID('stream-1', 0))
        manager.setUpSPID(new SPID('stream-2', 0))

        manager.addNeighbor(new SPID('stream-1', 0), 'n1')

        manager.addNeighbor(new SPID('stream-2', 0), 'n1')

        manager.removeSPID(new SPID('stream-1', 0))

        expect(manager.isSetUp(new SPID('stream-1', 0))).toEqual(false)

        expect(Array.from(manager.getSPIDKeys())).toEqual(['stream-2#0'])
    })

    test('updating counter', () => {
        manager.setUpSPID(new SPID('stream-1', 0))
        manager.setUpSPID(new SPID('stream-2', 0))

        manager.updateCounter(new SPID('stream-1', 0), 50)
        manager.updateCounter(new SPID('stream-2', 0), 100)
    })
})
