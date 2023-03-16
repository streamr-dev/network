import { NeighborFinder } from '../../src/logic/neighbor-discovery/NeighborFinder'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerList } from '../../src/logic/PeerList'
import { keyFromPeerDescriptor, PeerID, UUID } from '@streamr/dht'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { expect } from 'expect'

describe('NeighborFinder', () => {

    const peerId = PeerID.fromString('NeighborFinder')
    let targetNeighbors: PeerList
    let nearbyContactPool: PeerList
    let neighborFinder: NeighborFinder

    const createMockRemotePeer = (): RemoteRandomGraphNode => {
        const mockPeer: PeerDescriptor = {
            kademliaId: PeerID.fromString(new UUID().toString()).value,
            type: 0
        }
        return new RemoteRandomGraphNode(mockPeer, 'mock', {} as any)
    }

    const N = 4

    beforeEach(() => {
        targetNeighbors = new PeerList(peerId, 15)
        nearbyContactPool = new PeerList(peerId, 30)
        range(30).forEach(() => nearbyContactPool.add(createMockRemotePeer()))
        const mockDoFindNeighbors = async (excluded: string[]) => {
            const target = nearbyContactPool.getRandom(excluded)
            if (Math.random() < 0.5) {
                targetNeighbors.add(target)
            } else {
                excluded.push(keyFromPeerDescriptor(target.getPeerDescriptor()))
            }
            return excluded
        }
        neighborFinder = new NeighborFinder({
            targetNeighbors,
            nearbyContactPool,
            doFindNeighbors: (excluded) => mockDoFindNeighbors(excluded),
            N
        })
    })

    afterEach(() => {
        neighborFinder.stop()
    })

    it('Finds target number of peers', async () => {
        neighborFinder.start()
        await waitForCondition(() => targetNeighbors.size() >= N, 10000)
        expect(neighborFinder.isRunning()).toEqual(false)
    })
})
