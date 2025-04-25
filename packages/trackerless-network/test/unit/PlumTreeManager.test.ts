import { ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { NodeList } from '../../src/logic/NodeList'
import { PlumTreeManager } from '../../src/logic/plumtree/PlumTreeManager'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { MockTransport } from '../utils/mock/MockTransport'
import { StreamPartIDUtils, toStreamPartID, toUserId, toUserIdRaw } from '@streamr/utils'
import { randomUserId } from '@streamr/test-utils'

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
        await manager.resumeNeighbor(neighbor, 0)
        expect(manager.isNeighborPaused(neighbor)).toBe(false)
    })

    it('gets latest message timestamp', () => {
        const neighbor = createMockPeerDescriptor()
        const msg1 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), randomUserId(), 123)
        const msg2 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), randomUserId(), 456)
        const msg3 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), randomUserId(), 789)
        manager.broadcast(msg1, toNodeId(neighbor))
        manager.broadcast(msg2, toNodeId(neighbor))
        manager.broadcast(msg3, toNodeId(neighbor))
        expect(manager.getLatestMessageTimestamp()).toBe(msg3.messageId!.timestamp)
    })

})
