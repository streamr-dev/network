import { ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { NodeList } from '../../src/logic/NodeList'
import { PlumTreeManager } from '../../src/logic/plumtree/PlumTreeManager'
import { createMockPeerDescriptor } from '../utils/utils'
import { MockTransport } from '../utils/mock/MockTransport'

describe('PlumTreeManager', () => {

    let manager: PlumTreeManager
    let neighbors: NodeList
    let localPeerDescriptor: PeerDescriptor
    let rpcCommunicator: ListeningRpcCommunicator

    beforeEach(() => {
        localPeerDescriptor = createMockPeerDescriptor()
        neighbors = new NodeList(toNodeId(localPeerDescriptor), 4)
        rpcCommunicator = new ListeningRpcCommunicator('plumtree', new MockTransport())
        manager = new PlumTreeManager({
            neighbors,
            localPeerDescriptor,
            rpcCommunicator
        })
    })

    it('should be able to pause and resume neighbors', async () => {
        const neighbor = createMockPeerDescriptor()
        await manager.pauseNeighbor(neighbor)
        expect(manager.isNeighborPaused(neighbor)).toBe(true)
        await manager.resumeNeighbor(neighbor)
        expect(manager.isNeighborPaused(neighbor)).toBe(false)
    })

})
