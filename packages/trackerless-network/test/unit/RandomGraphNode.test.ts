import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { PeerDescriptor, PeerID, peerIdFromPeerDescriptor } from '@streamr/dht'
import { MockTransport } from '../utils/mock/Transport'
import { createMockRemotePeer, mockConnectionLocker } from '../utils/utils'
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
    let nearbyContactPool: NodeList
    let randomContactPool: NodeList

    beforeEach(async () => {
        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        targetNeighbors = new NodeList(peerId, 10)
        randomContactPool = new NodeList(peerId, 10)
        nearbyContactPool = new NodeList(peerId, 10)

        randomGraphNode = createRandomGraphNode({
            targetNeighbors,
            randomContactPool,
            nearbyContactPool,
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

    it('getTargetNeighborStringIds', () => {
        const mockRemote = createMockRemotePeer()
        targetNeighbors.add(mockRemote)
        const ids = randomGraphNode.getTargetNeighborStringIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
        targetNeighbors.remove(mockRemote.getPeerDescriptor())
    })

    it('getNearbyContactPoolIds', () => {
        const mockRemote = createMockRemotePeer()
        nearbyContactPool.add(mockRemote)
        const ids = randomGraphNode.getNearbyContactPoolIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

    it('getRandomContactPoolIds', () => {
        const mockRemote = createMockRemotePeer()
        randomContactPool.add(mockRemote)
        const ids = randomGraphNode.getRandomContactPoolIds()
        expect(ids[0]).toEqual(getNodeIdFromPeerDescriptor(mockRemote.getPeerDescriptor()))
    })

})
