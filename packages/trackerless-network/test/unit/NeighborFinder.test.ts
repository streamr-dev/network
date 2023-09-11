import { NeighborFinder } from '../../src/logic/neighbor-discovery/NeighborFinder'
import { NodeList } from '../../src/logic/NodeList'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { expect } from 'expect'
import { createMockRemoteNode, createRandomNodeId } from '../utils/utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'

describe('NeighborFinder', () => {

    const nodeId = createRandomNodeId()
    let targetNeighbors: NodeList
    let nearbyContactPool: NodeList
    let neighborFinder: NeighborFinder

    const N = 4

    beforeEach(() => {
        targetNeighbors = new NodeList(nodeId, 15)
        nearbyContactPool = new NodeList(nodeId, 30)
        range(30).forEach(() => nearbyContactPool.add(createMockRemoteNode()))
        const mockDoFindNeighbors = async (excluded: NodeID[]) => {
            const target = nearbyContactPool.getRandom(excluded)
            if (Math.random() < 0.5) {
                targetNeighbors.add(target!)
            } else {
                excluded.push(getNodeIdFromPeerDescriptor(target!.getPeerDescriptor()))
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

    it('Finds target number of nodes', async () => {
        neighborFinder.start()
        await waitForCondition(() => targetNeighbors.size() >= N, 10000)
        expect(neighborFinder.isRunning()).toEqual(false)
    })
})
