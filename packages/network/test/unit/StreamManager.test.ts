import { MessageLayer } from 'streamr-client-protocol'

import { StreamManager } from '../../src/logic/StreamManager'
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

        expect(manager.getInboundNodesForStream(new StreamIdAndPartition('stream-1', 0))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamIdAndPartition('stream-1', 0))).toEqual([])
        expect(manager.getInboundNodesForStream(new StreamIdAndPartition('stream-1', 1))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamIdAndPartition('stream-1', 1))).toEqual([])
        expect(manager.getInboundNodesForStream(new StreamIdAndPartition('stream-2', 0))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamIdAndPartition('stream-2', 0))).toEqual([])
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

    test('adding inbound and outbound nodes to a set-up stream', () => {
        const streamId = new StreamIdAndPartition('stream-id', 0)
        const streamId2 = new StreamIdAndPartition('stream-id-2', 0)

        manager.setUpStream(new StreamIdAndPartition('stream-id', 0))
        manager.addInboundNode(streamId, 'node-1')
        manager.addInboundNode(streamId, 'node-2')
        manager.addOutboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-3')

        manager.setUpStream(new StreamIdAndPartition('stream-id-2', 0))
        manager.addInboundNode(streamId2, 'node-1')
        manager.addInboundNode(streamId2, 'node-2')
        manager.addOutboundNode(streamId2, 'node-3')

        expect(manager.getInboundNodesForStream(streamId)).toEqual(['node-1', 'node-2'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-1', 'node-3'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-1', 'node-3'])
        expect(manager.getStreamsWithConnections((streamKey) => ['stream-id-2::0', 'stream-id::0'].includes(streamKey))).toEqual({
            'stream-id-2::0': {
                inboundNodes: ['node-1', 'node-2'],
                outboundNodes: ['node-3'],
                counter: 0
            },
            'stream-id::0': {
                inboundNodes: ['node-1', 'node-2'],
                outboundNodes: ['node-1', 'node-3'],
                counter: 0
            }
        })
        expect(manager.getAllNodesForStream(streamId)).toEqual(['node-1', 'node-2', 'node-3'])
        expect(manager.getAllNodesForStream(streamId2)).toEqual(['node-1', 'node-2', 'node-3'])

        expect(manager.hasInboundNode(streamId, 'node-1')).toEqual(true)
        expect(manager.hasInboundNode(streamId, 'node-3')).toEqual(false)
        expect(manager.hasOutboundNode(streamId, 'node-3')).toEqual(true)
        expect(manager.hasOutboundNode(streamId, 'node-2')).toEqual(false)
        expect(manager.hasOutboundNode(streamId, 'node-2')).toEqual(false)

        expect(manager.isNodePresent('node-1')).toEqual(true)
        expect(manager.isNodePresent('node-2')).toEqual(true)
        expect(manager.isNodePresent('node-3')).toEqual(true)
        expect(manager.isNodePresent('node-not-present')).toEqual(false)
    })

    test('removing node from stream removes it from both inbound and outbound nodes', () => {
        const streamId = new StreamIdAndPartition('stream-id', 0)
        const streamId2 = new StreamIdAndPartition('stream-id-2', 0)

        manager.setUpStream(streamId)
        manager.addInboundNode(streamId, 'node-2')
        manager.addInboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-3')

        manager.setUpStream(streamId2)
        manager.addInboundNode(streamId2, 'node-1')
        manager.addInboundNode(streamId2, 'node-2')
        manager.addOutboundNode(streamId2, 'node-3')

        expect(manager.getAllNodesForStream(streamId)).toEqual(['node-1', 'node-2', 'node-3'])
        expect(manager.getAllNodesForStream(streamId2)).toEqual(['node-1', 'node-2', 'node-3'])

        manager.removeNodeFromStream(streamId, 'node-1')

        expect(manager.getAllNodesForStream(streamId)).toEqual(['node-2', 'node-3'])
        expect(manager.getAllNodesForStream(streamId2)).toEqual(['node-1', 'node-2', 'node-3'])

        manager.removeNodeFromStream(streamId2, 'node-3')
        expect(manager.getAllNodesForStream(streamId)).toEqual(['node-2', 'node-3'])
        expect(manager.getAllNodesForStream(streamId2)).toEqual(['node-1', 'node-2'])

        expect(manager.getInboundNodesForStream(streamId)).toEqual(['node-2'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-3'])
        expect(manager.getStreamsWithConnections((streamKey) => ['stream-id-2::0', 'stream-id::0'].includes(streamKey))).toEqual({
            'stream-id-2::0': {
                inboundNodes: ['node-1', 'node-2'],
                outboundNodes: [],
                counter: 0
            },
            'stream-id::0': {
                inboundNodes: ['node-2'],
                outboundNodes: ['node-3'],
                counter: 0
            }
        })

        expect(manager.hasInboundNode(streamId, 'node-1')).toEqual(false)
        expect(manager.hasOutboundNode(streamId, 'node-1')).toEqual(false)
        expect(manager.isNodePresent('node-1')).toEqual(true)

        manager.removeNodeFromStream(streamId2, 'node-1')
        expect(manager.isNodePresent('node-1')).toEqual(false)
    })

    test('remove node from all streams', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-1', 1))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))

        manager.addInboundNode(new StreamIdAndPartition('stream-1', 0), 'node')
        manager.addOutboundNode(new StreamIdAndPartition('stream-1', 0), 'should-not-be-removed')
        manager.addOutboundNode(new StreamIdAndPartition('stream-1', 0), 'node')

        manager.addInboundNode(new StreamIdAndPartition('stream-1', 1), 'node')
        manager.addInboundNode(new StreamIdAndPartition('stream-1', 1), 'should-not-be-removed')
        manager.addOutboundNode(new StreamIdAndPartition('stream-1', 1), 'node')
        manager.addOutboundNode(new StreamIdAndPartition('stream-1', 1), 'should-not-be-removed')

        manager.addInboundNode(new StreamIdAndPartition('stream-2', 0), 'node')
        manager.addInboundNode(new StreamIdAndPartition('stream-2', 0), 'should-not-be-removed')
        manager.addOutboundNode(new StreamIdAndPartition('stream-2', 0), 'node')

        manager.removeNodeFromAllStreams('node')

        expect(manager.getInboundNodesForStream(new StreamIdAndPartition('stream-1', 0))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamIdAndPartition('stream-1', 0))).toEqual(['should-not-be-removed'])
        expect(manager.getInboundNodesForStream(new StreamIdAndPartition('stream-1', 1))).toEqual(['should-not-be-removed'])
        expect(manager.getOutboundNodesForStream(new StreamIdAndPartition('stream-1', 1))).toEqual(['should-not-be-removed'])
        expect(manager.getInboundNodesForStream(new StreamIdAndPartition('stream-2', 0))).toEqual(['should-not-be-removed'])
        expect(manager.getOutboundNodesForStream(new StreamIdAndPartition('stream-2', 0))).toEqual([])
        expect(manager.getStreamsWithConnections((streamKey) => ['stream-2::0', 'stream-1::0', 'stream-1::1'].includes(streamKey))).toEqual({
            'stream-1::0': {
                inboundNodes: [],
                outboundNodes: ['should-not-be-removed'],
                counter: 0
            },
            'stream-1::1': {
                inboundNodes: ['should-not-be-removed'],
                outboundNodes: ['should-not-be-removed'],
                counter: 0
            },
            'stream-2::0': {
                inboundNodes: ['should-not-be-removed'],
                outboundNodes: [],
                counter: 0
            }
        })

        expect(manager.hasInboundNode(new StreamIdAndPartition('stream-1', 0), 'node')).toEqual(false)
        expect(manager.hasOutboundNode(new StreamIdAndPartition('stream-2', 0), 'node')).toEqual(false)

        expect(manager.isNodePresent('should-not-be-removed')).toEqual(true)
        expect(manager.isNodePresent('node')).toEqual(false)
    })

    test('remove stream', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))

        manager.addInboundNode(new StreamIdAndPartition('stream-1', 0), 'n1')
        manager.addOutboundNode(new StreamIdAndPartition('stream-1', 0), 'n1')

        manager.addInboundNode(new StreamIdAndPartition('stream-2', 0), 'n1')
        manager.addOutboundNode(new StreamIdAndPartition('stream-2', 0), 'n1')

        manager.removeStream(new StreamIdAndPartition('stream-1', 0))

        expect(manager.isSetUp(new StreamIdAndPartition('stream-1', 0))).toEqual(false)

        expect(manager.getStreams()).toEqual([
            new StreamIdAndPartition('stream-2', 0)
        ])

        expect(manager.getStreamsWithConnections((streamKey) => ['stream-2::0', 'stream-1::0', 'stream-1::1'].includes(streamKey))).toEqual({
            'stream-2::0': {
                inboundNodes: ['n1'],
                outboundNodes: ['n1'],
                counter: 0
            }
        })
    })

    test('updating counter', () => {
        manager.setUpStream(new StreamIdAndPartition('stream-1', 0))
        manager.setUpStream(new StreamIdAndPartition('stream-2', 0))

        expect(manager.getStreamsWithConnections((streamKey) => ['stream-2::0', 'stream-1::0', 'stream-1::1'].includes(streamKey))).toEqual({
            'stream-1::0': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 0
            },
            'stream-2::0': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 0
            }
        })

        manager.updateCounter(new StreamIdAndPartition('stream-1', 0), 50)
        manager.updateCounter(new StreamIdAndPartition('stream-2', 0), 100)

        expect(manager.getStreamsWithConnections((streamKey) => ['stream-2::0', 'stream-1::0', 'stream-1::1'].includes(streamKey))).toEqual({
            'stream-1::0': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 50
            },
            'stream-2::0': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 100
            }
        })
    })
})
