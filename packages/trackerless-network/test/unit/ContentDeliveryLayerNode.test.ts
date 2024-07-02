import { getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { StreamPartIDUtils, waitForCondition } from '@streamr/utils'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { NodeList } from '../../src/logic/NodeList'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { MockDiscoveryLayerNode } from '../utils/mock/MockDiscoveryLayerNode'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockNeighborFinder } from '../utils/mock/MockNeighborFinder'
import { MockNeighborUpdateManager } from '../utils/mock/MockNeighborUpdateManager'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockContentDeliveryRpcRemote, createMockPeerDescriptor, mockConnectionLocker } from '../utils/utils'

describe('ContentDeliveryLayerNode', () => {

    let contentDeliveryLayerNode: ContentDeliveryLayerNode
    const peerDescriptor = createMockPeerDescriptor()

    let neighbors: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    let discoveryLayerNode: MockDiscoveryLayerNode

    beforeEach(async () => {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)

        neighbors = new NodeList(nodeId, 10)
        randomNodeView = new NodeList(nodeId, 10)
        nearbyNodeView = new NodeList(nodeId, 10)
        discoveryLayerNode = new MockDiscoveryLayerNode()

        contentDeliveryLayerNode = createContentDeliveryLayerNode({
            neighbors,
            randomNodeView,
            nearbyNodeView,
            transport: new MockTransport(),
            localPeerDescriptor: peerDescriptor,
            discoveryLayerNode,
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
        discoveryLayerNode.setClosestContacts([peerDescriptor1, peerDescriptor2])
        discoveryLayerNode.emit('nearbyContactAdded', peerDescriptor1)
        await waitForCondition(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 randomContactAdded event to randomNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        discoveryLayerNode.setRandomContacts([peerDescriptor1, peerDescriptor2])
        discoveryLayerNode.emit('randomContactAdded', peerDescriptor1)
        await waitForCondition(() => randomNodeView.size() === 2)
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(randomNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Nodes from layer1 neighbors to nearbyNodeView if its size is below nodeViewSize', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        discoveryLayerNode.addNewRandomPeerToKBucket()
        discoveryLayerNode.setClosestContacts([peerDescriptor1, peerDescriptor2])
        discoveryLayerNode.emit('nearbyContactAdded', peerDescriptor1)
        await waitForCondition(() => {
            return nearbyNodeView.size() === 3
        }, 20000)
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(getNodeIdFromPeerDescriptor(peerDescriptor2))).toBeTruthy()
    }, 25000)

})
