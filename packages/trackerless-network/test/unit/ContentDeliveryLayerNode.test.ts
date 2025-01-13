import { toNodeId } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
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
        const nodeId = toNodeId(peerDescriptor)

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
        expect(toNodeId(result[0])).toEqual(toNodeId(mockRemote.getPeerDescriptor()))
    })

    it('getNearbyNodeView', () => {
        const mockRemote = createMockContentDeliveryRpcRemote()
        nearbyNodeView.add(mockRemote)
        const ids = contentDeliveryLayerNode.getNearbyNodeView().getIds()
        expect(ids[0]).toEqual(toNodeId(mockRemote.getPeerDescriptor()))
    })

    it('Adds Closest Nodes from layer1 nearbyContactAdded event to nearbyNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        discoveryLayerNode.setClosestContacts([peerDescriptor1, peerDescriptor2])
        discoveryLayerNode.emit('nearbyContactAdded', peerDescriptor1)
        await until(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.get(toNodeId(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(toNodeId(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 randomContactAdded event to randomNodeView', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        discoveryLayerNode.setRandomContacts([peerDescriptor1, peerDescriptor2])
        discoveryLayerNode.emit('randomContactAdded', peerDescriptor1)
        await until(() => randomNodeView.size() === 2)
        expect(randomNodeView.get(toNodeId(peerDescriptor1))).toBeTruthy()
        expect(randomNodeView.get(toNodeId(peerDescriptor2))).toBeTruthy()
    })

    it('Adds Nodes from layer1 neighbors to nearbyNodeView if its size is below nodeViewSize', async () => {
        const peerDescriptor1 = createMockPeerDescriptor()
        const peerDescriptor2 = createMockPeerDescriptor()
        discoveryLayerNode.addNewRandomPeerToKBucket()
        discoveryLayerNode.setClosestContacts([peerDescriptor1, peerDescriptor2])
        discoveryLayerNode.emit('nearbyContactAdded', peerDescriptor1)
        await until(() => {
            return nearbyNodeView.size() === 3
        }, 20000)
        expect(nearbyNodeView.get(toNodeId(peerDescriptor1))).toBeTruthy()
        expect(nearbyNodeView.get(toNodeId(peerDescriptor2))).toBeTruthy()
    }, 25000)

    it('getInfo', () => {
        const nodeWithRtt = createMockContentDeliveryRpcRemote()
        neighbors.add(nodeWithRtt)
        const nodeWithoutRtt = createMockContentDeliveryRpcRemote()
        neighbors.add(nodeWithoutRtt)
        nodeWithRtt.setRtt(100)
        const info = contentDeliveryLayerNode.getInfos()
        expect(info[0].rtt).toEqual(100)
        expect(info[0].peerDescriptor).toEqual(nodeWithRtt.getPeerDescriptor())
        expect(info[1].rtt).toBeUndefined()
        expect(info[1].peerDescriptor).toEqual(nodeWithoutRtt.getPeerDescriptor())
    })
})
