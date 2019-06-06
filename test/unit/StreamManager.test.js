const { MessageLayer } = require('streamr-client-protocol')
const StreamManager = require('../../src/logic/StreamManager')
const { StreamID, MessageReference } = require('../../src/identifiers')

const { MessageID } = MessageLayer

describe('StreamManager', () => {
    let manager

    beforeEach(() => {
        manager = new StreamManager()
    })

    test('starts out empty', () => {
        expect(manager.isSetUp(new StreamID('streamId', 0))).toEqual(false)
        expect(manager.getStreams()).toEqual([])
        expect(manager.getStreamsAsKeys()).toEqual([])
    })

    test('setting up streams and testing values', () => {
        manager.setUpStream(new StreamID('stream-1', 0))
        manager.setUpStream(new StreamID('stream-2', 0))
        manager.setUpStream(new StreamID('stream-1', 1))

        expect(manager.isSetUp(new StreamID('stream-1', 0))).toEqual(true)
        expect(manager.isSetUp(new StreamID('stream-1', 1))).toEqual(true)
        expect(manager.isSetUp(new StreamID('stream-2', 0))).toEqual(true)

        expect(manager.getStreams()).toEqual([
            new StreamID('stream-1', 0),
            new StreamID('stream-1', 1),
            new StreamID('stream-2', 0)
        ])
        expect(manager.getStreamsAsKeys()).toEqual(['stream-1::0', 'stream-1::1', 'stream-2::0'])

        expect(manager.getInboundNodesForStream(new StreamID('stream-1', 0))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamID('stream-1', 0))).toEqual([])
        expect(manager.getInboundNodesForStream(new StreamID('stream-1', 1))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamID('stream-1', 1))).toEqual([])
        expect(manager.getInboundNodesForStream(new StreamID('stream-2', 0))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamID('stream-2', 0))).toEqual([])
    })

    test('cannot re-setup same stream', () => {
        manager.setUpStream(new StreamID('stream-id', 0))

        expect(() => {
            manager.setUpStream(new StreamID('stream-id', 0))
        }).toThrowError('Stream stream-id::0 already set up')
    })

    test('can duplicate detect on previously set up stream', () => {
        manager.setUpStream(new StreamID('stream-id', 0))

        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID('stream-id', 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageReference(5, 0)
            )
        }).not.toThrowError()
    })

    test('cannot duplicate detect on non-existing stream', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(
                new MessageID('stream-id', 0, 10, 0, 'publisher-id', 'session-id'),
                new MessageReference(5, 0)
            )
        }).toThrowError('Stream stream-id::0 is not set up')
    })

    test('duplicate detection is per publisher, msgChainId', () => {
        manager.setUpStream(new StreamID('stream-id', 0))
        manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-1', 'session-1'),
            new MessageReference(5, 0)
        )

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-1', 'session-1'),
            new MessageReference(5, 0)
        )).toEqual(false)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-2', 'session-1'),
            new MessageReference(5, 0)
        )).toEqual(true)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-1', 'session-2'),
            new MessageReference(5, 0)
        )).toEqual(true)

        expect(manager.markNumbersAndCheckThatIsNotDuplicate(
            new MessageID('stream-id', 0, 10, 0, 'publisher-2', 'session-2'),
            new MessageReference(5, 0)
        )).toEqual(true)
    })

    test('adding inbound and outbound nodes to a set-up stream', () => {
        const streamId = new StreamID('stream-id', 0)
        const streamId2 = new StreamID('stream-id-2', 0)

        manager.setUpStream(new StreamID('stream-id', 0))
        manager.addInboundNode(streamId, 'node-1')
        manager.addInboundNode(streamId, 'node-2')
        manager.addOutboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-3')

        manager.setUpStream(new StreamID('stream-id-2', 0))
        manager.addInboundNode(streamId2, 'node-1')
        manager.addInboundNode(streamId2, 'node-2')
        manager.addOutboundNode(streamId2, 'node-3')

        expect(manager.getInboundNodesForStream(streamId)).toEqual(['node-1', 'node-2'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-1', 'node-3'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-1', 'node-3'])
        expect(manager.getStreamsWithConnections()).toEqual({
            'stream-id-2::0': {
                inboundNodes: ['node-1', 'node-2'],
                outboundNodes: ['node-3']
            },
            'stream-id::0': {
                inboundNodes: ['node-1', 'node-2'],
                outboundNodes: ['node-1', 'node-3']
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
        const streamId = new StreamID('stream-id', 0)
        const streamId2 = new StreamID('stream-id-2', 0)

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
        expect(manager.getStreamsWithConnections()).toEqual({
            'stream-id-2::0': {
                inboundNodes: ['node-1', 'node-2'],
                outboundNodes: []
            },
            'stream-id::0': {
                inboundNodes: ['node-2'],
                outboundNodes: ['node-3']
            }
        })

        expect(manager.hasInboundNode(streamId, 'node-1')).toEqual(false)
        expect(manager.hasOutboundNode(streamId, 'node-1')).toEqual(false)
        expect(manager.isNodePresent('node-1')).toEqual(true)

        manager.removeNodeFromStream(streamId2, 'node-1')
        expect(manager.isNodePresent('node-1')).toEqual(false)
    })

    test('remove node from all streams', () => {
        manager.setUpStream(new StreamID('stream-1', 0))
        manager.setUpStream(new StreamID('stream-1', 1))
        manager.setUpStream(new StreamID('stream-2', 0))

        manager.addInboundNode(new StreamID('stream-1', 0), 'node')
        manager.addOutboundNode(new StreamID('stream-1', 0), 'should-not-be-removed')
        manager.addOutboundNode(new StreamID('stream-1', 0), 'node')

        manager.addInboundNode(new StreamID('stream-1', 1), 'node')
        manager.addInboundNode(new StreamID('stream-1', 1), 'should-not-be-removed')
        manager.addOutboundNode(new StreamID('stream-1', 1), 'node')
        manager.addOutboundNode(new StreamID('stream-1', 1), 'should-not-be-removed')

        manager.addInboundNode(new StreamID('stream-2', 0), 'node')
        manager.addInboundNode(new StreamID('stream-2', 0), 'should-not-be-removed')
        manager.addOutboundNode(new StreamID('stream-2', 0), 'node')

        manager.removeNodeFromAllStreams('node')

        expect(manager.getInboundNodesForStream(new StreamID('stream-1', 0))).toEqual([])
        expect(manager.getOutboundNodesForStream(new StreamID('stream-1', 0))).toEqual(['should-not-be-removed'])
        expect(manager.getInboundNodesForStream(new StreamID('stream-1', 1))).toEqual(['should-not-be-removed'])
        expect(manager.getOutboundNodesForStream(new StreamID('stream-1', 1))).toEqual(['should-not-be-removed'])
        expect(manager.getInboundNodesForStream(new StreamID('stream-2', 0))).toEqual(['should-not-be-removed'])
        expect(manager.getOutboundNodesForStream(new StreamID('stream-2', 0))).toEqual([])
        expect(manager.getStreamsWithConnections()).toEqual({
            'stream-1::0': {
                inboundNodes: [],
                outboundNodes: ['should-not-be-removed']
            },
            'stream-1::1': {
                inboundNodes: ['should-not-be-removed'],
                outboundNodes: ['should-not-be-removed']
            },
            'stream-2::0': {
                inboundNodes: ['should-not-be-removed'],
                outboundNodes: []
            }
        })

        expect(manager.hasInboundNode(new StreamID('stream-1', 0), 'node')).toEqual(false)
        expect(manager.hasOutboundNode(new StreamID('stream-2', 0), 'node')).toEqual(false)

        expect(manager.isNodePresent('should-not-be-removed')).toEqual(true)
        expect(manager.isNodePresent('node')).toEqual(false)
    })

    test('remove stream', () => {
        manager.setUpStream(new StreamID('stream-1', 0))
        manager.setUpStream(new StreamID('stream-2', 0))

        manager.addInboundNode(new StreamID('stream-1', 0), 'n1')
        manager.addOutboundNode(new StreamID('stream-1', 0), 'n1')

        manager.addInboundNode(new StreamID('stream-2', 0), 'n1')
        manager.addOutboundNode(new StreamID('stream-2', 0), 'n1')

        manager.removeStream(new StreamID('stream-1', 0))

        expect(manager.isSetUp(new StreamID('stream-1', 0))).toEqual(false)

        expect(manager.getStreams()).toEqual([
            new StreamID('stream-2', 0)
        ])

        expect(manager.getStreamsWithConnections()).toEqual({
            'stream-2::0': {
                inboundNodes: ['n1'],
                outboundNodes: ['n1']
            }
        })
    })
})
