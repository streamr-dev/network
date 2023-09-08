import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { PeerDescriptor, PeerID, peerIdFromPeerDescriptor } from '@streamr/dht'
import { MockTransport } from '../utils/mock/Transport'
import { createMockRemoteNode, mockConnectionLocker } from '../utils/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { NodeList } from '../../src/logic/NodeList'
import { MockHandshaker } from '../utils/mock/MockHandshaker'
import { MockNeighborUpdateManager } from '../utils/mock/MockNeighborUpdateManager'
import { MockNeighborFinder } from '../utils/mock/MockNeighborFinder'
import { mockLayer1 } from '../utils/mock/MockLayer1'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'

describe('RandomGraphNode', () => {

    let randomGraphNode: RandomGraphNode
    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('random-graph-node').value,
        type: 0
    }

    let targetNeighbors: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    beforeEach(async () => {
        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        targetNeighbors = new NodeList(peerId, 10)
        randomNodeView = new NodeList(peerId, 10)
        nearbyNodeView = new NodeList(peerId, 10)

        randomGraphNode = createRandomGraphNode({
            targetNeighbors,
            randomNodeView,
            nearbyNodeView,
            P2PTransport: new MockTransport(),
            ownPeerDescriptor: peerDescriptor,
            layer1: mockLayer1 as any,
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

    it('getRandomNodeView', () => {
        const mockRemote = createMockRemoteNode()
        randomNodeView.add(mockRemote)
        const ids = randomGraphNode.getRandomNodeView().getIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

})
