const StreamManager = require('../../src/logic/StreamManager')
const { StreamID } = require('../../src/identifiers')

describe('StreamManager', () => {
    let manager

    beforeEach(() => {
        manager = new StreamManager()
    })

    test('starts out empty', () => {
        expect(manager.isSetUp(new StreamID('streamId', 0))).toEqual(false)
        expect(manager.getStreams()).toEqual([])
    })

    test('setting up streams and testing values', () => {
        manager.setUpStream(new StreamID('stream-1', 0))
        manager.setUpStream(new StreamID('stream-2', 0))
        manager.setUpStream(new StreamID('stream-1', 1))

        expect(manager.isSetUp(new StreamID('stream-1', 0))).toEqual(true)
        expect(manager.isSetUp(new StreamID('stream-1', 1))).toEqual(true)
        expect(manager.isSetUp(new StreamID('stream-2', 0))).toEqual(true)
        expect(manager.getStreams()).toEqual(['stream-1::0', 'stream-1::1', 'stream-2::0'])
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
            manager.markNumbersAndCheckThatIsNotDuplicate(new StreamID('stream-id', 0), 2, 1)
        }).not.toThrowError()
    })

    test('cannot duplicate detect on non-existing stream', () => {
        expect(() => {
            manager.markNumbersAndCheckThatIsNotDuplicate(new StreamID('stream-id', 0), 2, 1)
        }).toThrowError('Stream stream-id::0 is not set up')
    })

    test('adding inbound and outbound nodes to a set-up stream', () => {
        const streamId = new StreamID('stream-id', 0)

        manager.setUpStream(streamId)
        manager.addInboundNode(streamId, 'node-1')
        manager.addInboundNode(streamId, 'node-2')
        manager.addOutboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-3')

        expect(manager.getInboundNodesForStream(streamId)).toEqual(['node-1', 'node-2'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-1', 'node-3'])

        expect(manager.hasInboundNode(streamId, 'node-1')).toEqual(true)
        expect(manager.hasInboundNode(streamId, 'node-3')).toEqual(false)
        expect(manager.hasOutboundNode(streamId, 'node-3')).toEqual(true)
        expect(manager.hasOutboundNode(streamId, 'node-2')).toEqual(false)
    })

    test('removing node from stream removes it from both inbound and outbound nodes', () => {
        const streamId = new StreamID('stream-id', 0)

        manager.setUpStream(streamId)
        manager.addInboundNode(streamId, 'node-2')
        manager.addInboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-1')
        manager.addOutboundNode(streamId, 'node-3')

        manager.removeNodeFromStream(streamId, 'node-1')

        expect(manager.getInboundNodesForStream(streamId)).toEqual(['node-2'])
        expect(manager.getOutboundNodesForStream(streamId)).toEqual(['node-3'])

        expect(manager.hasInboundNode(streamId, 'node-1')).toEqual(false)
        expect(manager.hasOutboundNode(streamId, 'node-1')).toEqual(false)
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

        expect(manager.hasInboundNode(new StreamID('stream-1', 0), 'node')).toEqual(false)
        expect(manager.hasOutboundNode(new StreamID('stream-2', 0), 'node')).toEqual(false)
    })
})
