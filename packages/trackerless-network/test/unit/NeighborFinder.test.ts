import { NeighborFinder } from '../../src/logic/neighbor-discovery/NeighborFinder'
import { PeerList } from '../../src/logic/PeerList'
import { keyFromPeerDescriptor, PeerID } from '@streamr/dht'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { expect } from 'expect'
import { createMockRemotePeer } from '../utils'

describe('NeighborFinder', () => {

    const peerId = PeerID.fromString('NeighborFinder')
    let targetNeighbors: PeerList
    let nearbyContactPool: PeerList
    let neighborFinder: NeighborFinder

    const N = 4

    beforeEach(() => {
        targetNeighbors = new PeerList(peerId, 15)
        nearbyContactPool = new PeerList(peerId, 30)
        range(30).forEach(() => nearbyContactPool.add(createMockRemotePeer()))
        const mockDoFindNeighbors = async (excluded: string[]) => {
            const target = nearbyContactPool.getRandom(excluded)
            if (Math.random() < 0.5) {
                targetNeighbors.add(target!)
            } else {
                excluded.push(keyFromPeerDescriptor(target!.getPeerDescriptor()))
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
