import { waitForCondition } from '@streamr/utils'
import { NodeList } from '../../src/logic/NodeList'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'
import { MockNeighborFinder } from '../utils/mock/MockNeighborFinder'
import { MockNeighborUpdateManager } from '../utils/mock/MockNeighborUpdateManager'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor, createMockContentDeliveryRpcRemote, mockConnectionLocker } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { getNodeIdFromPeerDescriptor } from '@streamr/dht'

describe('ContentDeliveryLayerNode', () => {

    let contentDeliveryLayerNode: ContentDeliveryLayerNode
    const peerDescriptor = createMockPeerDescriptor()

    let neighbors: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    let layer1Node: MockLayer1Node

    beforeEach(async () => {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)

        neighbors = new NodeList(nodeId, 10)
        randomNodeView = new NodeList(nodeId, 10)
        nearbyNodeView = new NodeList(nodeId, 10)
        layer1Node = new MockLayer1Node()

        contentDeliveryLayerNode = createContentDeliveryLayerNode({
            neighbors,
            randomNodeView,
            nearbyNodeView,
            transport: new MockTransport(),
            localPeerDescriptor: peerDescriptor,
            layer1Node,
            connectionLocker: mockConnectionLocker,
            handshaker: new MockHandshaker() as any,
            neighborUpdateManager: new MockNeighborUpdateManager() as any,
            neighborFinder: new MockNeighborFinder() as any,
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            isLocalNodeEntryPoint: () => false
        })
        await contentDeliveryLayerNode.start()
    })

    afterEach(() => {
        contentDeliveryLayerNode.stop()
    })

    it('getNeighbors', () => {
        const mockRemote = createMockContentDeliveryRpcRemote()
        neighbors.add(mockRemote)
        const result = contentDeliveryLayerNode.getNeighbors()
        expect(getNodeIdFromPeerDescriptor(result[0])).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

    it('getNearbyNodeView', () => {
        const mockRemote = createMockContentDeliveryRpcRemote()
        nearbyNodeView.add(mockRemote)
        const ids = contentDeliveryLayerNode.getNearbyNodeView().getIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

    it('Adds Closest Nodes from layer1 nearbyContactAdded event to nearbyNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1Node.setClosestContacts([peerDescriptor1, peerDescriptor2])
        layer1Node.emit('nearbyContactAdded', peerDescriptor1)
        await waitForCondition(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 randomContactAdded event to randomNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1Node.setRandomContacts([peerDescriptor1, peerDescriptor2])
        layer1Node.emit('randomContactAdded', peerDescriptor1)
        await waitForCondition(() => randomNodeView.size() === 2)
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    // TODO update test description (do not use the term KBucket)
    it('Adds Nodes from layer1 KBucket to nearbyNodeView if its size is below nodeViewSize', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        layer1Node.addNewRandomPeerToKBucket()
        layer1Node.setClosestContacts([peerDescriptor1, peerDescriptor2])
        layer1Node.emit('nearbyContactAdded', peerDescriptor1)
        await waitForCondition(() => {
            return nearbyNodeView.size() === 3
        }, 20000)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    }, 25000)

})
