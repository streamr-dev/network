import { waitForCondition } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'
import { MockNeighborFinder } from '../utils/mock/MockNeighborFinder'
import { MockNeighborUpdateManager } from '../utils/mock/MockNeighborUpdateManager'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createMockDeliveryRpcRemote, mockConnectionLocker } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'

describe('RandomGraphNode', () => {

    let randomGraphNode: RandomGraphNode
    const peerDescriptor = createMockPeerDescriptor()

    let targetNeighbors: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    let layer1Node: MockLayer1Node

    beforeEach(async () => {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)

        targetNeighbors = new NodeList(nodeId, 10)
        randomNodeView = new NodeList(nodeId, 10)
        nearbyNodeView = new NodeList(nodeId, 10)
        layer1Node = new MockLayer1Node()

        randomGraphNode = createRandomGraphNode({
            targetNeighbors,
            randomNodeView,
            nearbyNodeView,
            transport: new MockTransport(),
            ownPeerDescriptor: peerDescriptor,
            layer1Node,
            connectionLocker: mockConnectionLocker,
            handshaker: new MockHandshaker(),
            neighborUpdateManager: new MockNeighborUpdateManager(),
            neighborFinder: new MockNeighborFinder(),
            streamPartId: StreamPartIDUtils.parse('stream#0')
        })
        await randomGraphNode.start()
    })

    afterEach(() => {
        randomGraphNode.stop()
    })

    it('getTargetNeighborIds', () => {
        const mockRemote = createMockDeliveryRpcRemote()
        targetNeighbors.add(mockRemote)
        const ids = randomGraphNode.getTargetNeighborIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
        targetNeighbors.remove(mockRemote.getPeerDescriptor())
    })

    it('getNearbyNodeView', () => {
        const mockRemote = createMockDeliveryRpcRemote()
        nearbyNodeView.add(mockRemote)
        const ids = randomGraphNode.getNearbyNodeView().getIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

    it('Adds Closest Nodes from layer1 newContact event to nearbyNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1Node.emit('newContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 newRandomContact event to randomNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1Node.emit('newRandomContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => randomNodeView.size() === 2)
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it.skip('Adds Nodes from layer1 KBucket to nearbyNodeView if its size is below nodeViewSize', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1Node.addNewRandomPeerToKBucket()
        layer1Node.emit('newContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => nearbyNodeView.size() === 3, 20000)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    }, 25000)

})
