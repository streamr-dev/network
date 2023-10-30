import { waitForCondition } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockLayer1 } from '../utils/mock/MockLayer1'
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

    let layer1: MockLayer1
    beforeEach(async () => {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)

        targetNeighbors = new NodeList(nodeId, 10)
        randomNodeView = new NodeList(nodeId, 10)
        nearbyNodeView = new NodeList(nodeId, 10)
        layer1 = new MockLayer1()

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
        layer1.emit('newContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 newRandomContact event to randomNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1.emit('newRandomContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => randomNodeView.size() === 2)
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it.skip('Adds Nodes from layer1 KBucket to nearbyNodeView if its size is below nodeViewSize', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1.addNewRandomPeerToKBucket()
        layer1.emit('newContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => nearbyNodeView.size() === 3, 20000)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    }, 25000)

})
