import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { NodeType, PeerDescriptor } from '@streamr/dht'
import { MockTransport } from '../utils/mock/Transport'
import { createMockRemoteNode, createRandomNodeId, mockConnectionLocker } from '../utils/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { NodeList } from '../../src/logic/NodeList'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockNeighborUpdateManager } from '../utils/mock/MockNeighborUpdateManager'
import { MockNeighborFinder } from '../utils/mock/MockNeighborFinder'
import { MockLayer1 } from '../utils/mock/MockLayer1'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { hexToBinary, waitForCondition } from '@streamr/utils'

describe('RandomGraphNode', () => {

    let randomGraphNode: RandomGraphNode
    const peerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

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

    afterEach(async () => {
        await randomGraphNode.stop()
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
        const nodeId1 = createRandomNodeId()
        const peerDescriptor1 = {
            kademliaId: hexToBinary(nodeId1),
            type: NodeType.NODEJS 
        }
        const nodeId2 = createRandomNodeId()
        const peerDescriptor2 = {
            kademliaId: hexToBinary(nodeId2),
            type: NodeType.NODEJS 
        }
        layer1.emit('newContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => nearbyNodeView.size() === 2)
        expect(nearbyNodeView.getNeighborById(nodeId1)).toBeTruthy()
        expect(nearbyNodeView.getNeighborById(nodeId2)).toBeTruthy()
    })

    it('Adds Random Nodes from layer1 newRandomContact event to randomNodeView', async () => {
        const nodeId1 = createRandomNodeId()
        const peerDescriptor1 = {
            kademliaId: hexToBinary(nodeId1),
            type: NodeType.NODEJS 
        }
        const nodeId2 = createRandomNodeId()
        const peerDescriptor2 = {
            kademliaId: hexToBinary(nodeId2),
            type: NodeType.NODEJS 
        }
        layer1.emit('newRandomContact', peerDescriptor1, [peerDescriptor1, peerDescriptor2])
        await waitForCondition(() => randomNodeView.size() === 2)
        expect(randomNodeView.getNeighborById(nodeId1)).toBeTruthy()
        expect(randomNodeView.getNeighborById(nodeId2)).toBeTruthy()
    })

})
