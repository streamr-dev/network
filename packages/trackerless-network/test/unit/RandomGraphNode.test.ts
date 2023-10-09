import { PeerDescriptor } from '@streamr/dht'
import { waitForCondition } from '@streamr/utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockLayer1 } from '../utils/mock/MockLayer1'
import { MockNeighborFinder } from '../utils/mock/MockNeighborFinder'
import { MockNeighborUpdateManager } from '../utils/mock/MockNeighborUpdateManager'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createMockRemoteNode, mockConnectionLocker } from '../utils/utils'

const createMockNode = (): { getPeerDescriptor: () => PeerDescriptor } => {
    const descriptor = createMockPeerDescriptor()
    return { 
        getPeerDescriptor: () => descriptor
    }
}

describe('RandomGraphNode', () => {

    let randomGraphNode: RandomGraphNode
    const peerDescriptor = createMockPeerDescriptor()

    let targetNeighbors: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    let layer1: MockLayer1
    beforeEach(async () => {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)

        targetNeighbors = new NodeList(nodeId, 10)
        randomNodeView = new NodeList(nodeId, 10)
        nearbyNodeView = new NodeList(nodeId, 10)
        layer1 = new MockLayer1(nodeId)

        randomGraphNode = createRandomGraphNode({
            targetNeighbors,
            randomNodeView,
            nearbyNodeView,
            P2PTransport: new MockTransport(),
            ownPeerDescriptor: peerDescriptor,
            layer1,
            connectionLocker: mockConnectionLocker,
            handshaker: new MockHandshaker(),
            neighborUpdateManager: new MockNeighborUpdateManager(),
            neighborFinder: new MockNeighborFinder(),
            randomGraphId: 'random-graph'
        })
        await randomGraphNode.start()
    })

    afterEach(() => {
        randomGraphNode.stop()
    })

    it('getTargetNeighborIds', () => {
        const mockRemote = createMockRemoteNode()
        targetNeighbors.add(mockRemote)
        const ids = randomGraphNode.getTargetNeighborIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
        targetNeighbors.remove(mockRemote.getPeerDescriptor())
    })

    it('getNearbyNodeView', () => {
        const mockRemote = createMockRemoteNode()
        nearbyNodeView.add(mockRemote)
        const ids = randomGraphNode.getNearbyNodeView().getIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

    it('Adds Closest Nodes from layer1 newContact event to nearbyNodeView', async () => {
        const node1 = createMockNode()
        const node2 = createMockNode()
        layer1.emit('newContact', node1, [node1, node2])
        await waitForCondition(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.getNeighborById(getNodeIdFromPeerDescriptor(node1.getPeerDescriptor()))).toBeTruthy()
        expect(nearbyNodeView.getNeighborById(getNodeIdFromPeerDescriptor(node2.getPeerDescriptor()))).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 newRandomContact event to randomNodeView', async () => {
        const node1 = createMockNode()
        const node2 = createMockNode()
        layer1.emit('newRandomContact', node1, [node1, node2])
        await waitForCondition(() => randomNodeView.size() === 2)
        expect(randomNodeView.getNeighborById(getNodeIdFromPeerDescriptor(node1.getPeerDescriptor()))).toBeTruthy()
        expect(randomNodeView.getNeighborById(getNodeIdFromPeerDescriptor(node2.getPeerDescriptor()))).toBeTruthy()
    })

    it('Adds Nodes from layer1 KBucket to nearbyNodeView if its size is below nodeViewSize', async () => {
        const node1 = createMockNode()
        const node2 = createMockNode()
        layer1.addNewRandomPeerToKBucket()
        layer1.emit('newContact', node1, [node1, node2])
        await waitForCondition(() => nearbyNodeView.size() === 3)
        expect(nearbyNodeView.getNeighborById(getNodeIdFromPeerDescriptor(node1.getPeerDescriptor()))).toBeTruthy()
        expect(nearbyNodeView.getNeighborById(getNodeIdFromPeerDescriptor(node2.getPeerDescriptor()))).toBeTruthy()
    })

})
