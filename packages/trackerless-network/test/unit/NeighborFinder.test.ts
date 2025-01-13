import { NeighborFinder } from '../../src/logic/neighbor-discovery/NeighborFinder'
import { NodeList } from '../../src/logic/NodeList'
import { until } from '@streamr/utils'
import { range } from 'lodash'
import { expect } from 'expect'
import { createMockContentDeliveryRpcRemote } from '../utils/utils'
import { DhtAddress, randomDhtAddress, toNodeId } from '@streamr/dht'

describe('NeighborFinder', () => {
    const nodeId = randomDhtAddress()
    let neighbors: NodeList
    let nearbyNodeView: NodeList
    let neighborFinder: NeighborFinder

    const minCount = 4

    beforeEach(() => {
        neighbors = new NodeList(nodeId, 15)
        nearbyNodeView = new NodeList(nodeId, 30)
        range(30).forEach(() => nearbyNodeView.add(createMockContentDeliveryRpcRemote()))
        const mockDoFindNeighbors = async (excluded: DhtAddress[]) => {
            const target = nearbyNodeView.getRandom(excluded)
            if (Math.random() < 0.5) {
                neighbors.add(target!)
            } else {
                excluded.push(toNodeId(target!.getPeerDescriptor()))
            }
            return excluded
        }
        neighborFinder = new NeighborFinder({
            neighbors,
            nearbyNodeView,
            leftNodeView: new NodeList(nodeId, 30),
            rightNodeView: new NodeList(nodeId, 30),
            randomNodeView: new NodeList(nodeId, 30),
            doFindNeighbors: (excluded) => mockDoFindNeighbors(excluded),
            minCount
        })
    })

    afterEach(() => {
        neighborFinder.stop()
    })

    it('Finds target number of nodes', async () => {
        neighborFinder.start()
        await until(() => neighbors.size() >= minCount, 10000)
        expect(neighborFinder.isRunning()).toEqual(false)
    })
})
