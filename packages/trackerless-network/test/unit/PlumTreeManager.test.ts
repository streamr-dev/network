import { ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { NodeList } from '../../src/logic/NodeList'
import { PlumTreeManager } from '../../src/logic/plumtree/PlumTreeManager'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { MockTransport } from '../utils/mock/MockTransport'
import { StreamPartIDUtils, until, wait } from '@streamr/utils'
import { randomUserId } from '@streamr/test-utils'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { create } from 'lodash'

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
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        await manager.pauseNeighbor(neighbor, 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        await manager.resumeNeighbor(neighbor, 'test', 0)
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('should not pause neighbors that are not in the neighbors list', async () => {
        const neighbor = createMockPeerDescriptor()
        await manager.pauseNeighbor(neighbor, 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('should pause based on message chain id', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        await manager.pauseNeighbor(neighbor, 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor, 'test2')).toBe(false)
        await manager.pauseNeighbor(neighbor, 'test2')
        expect(manager.isNeighborPaused(neighbor, 'test2')).toBe(true)
        await manager.resumeNeighbor(neighbor, 'test2', 0)
        expect(manager.isNeighborPaused(neighbor, 'test2')).toBe(false)
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
    })

    it('gets latest message timestamp', () => {
        const neighbor = createMockPeerDescriptor()
        const publisher = randomUserId()
        const msg1 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), publisher, 123)
        const msg2 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), publisher, 456)
        const msg3 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), publisher, 789)
        manager.broadcast(msg1, toNodeId(neighbor))
        manager.broadcast(msg2, toNodeId(neighbor))
        manager.broadcast(msg3, toNodeId(neighbor))
        expect(manager.getLatestMessageTimestamp(msg1.messageId!.messageChainId)).toBe(msg3.messageId!.timestamp)
    })

    it('broadcast emits message event', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        const msg = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), randomUserId(), 123)
        await manager.pauseNeighbor(neighbor, msg.messageId!.messageChainId)
        expect(manager.isNeighborPaused(neighbor, msg.messageId!.messageChainId)).toBe(true)
        manager.on('message', (msg) => {
            expect(msg.messageId!.messageChainId).toBe(msg.messageId!.messageChainId)
        })
        manager.broadcast(msg, toNodeId(neighbor))
        expect(manager.isNeighborPaused(neighbor, msg.messageId!.messageChainId)).toBe(true)
        await wait(100)
    })

    it('removes paused node if neighbor is removed', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        await manager.pauseNeighbor(neighbor, 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        neighbors.remove(toNodeId(neighbor))
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('If neighbor is removed and it leads to all neighbors being paused, it resumes the first neighbor', async () => {
        const neighbor1 = createMockPeerDescriptor()
        const neighbor2 = createMockPeerDescriptor()
        const neighbor3 = createMockPeerDescriptor()
        const neighbor4 = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor1, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor2, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor3, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor4, rpcCommunicator, ContentDeliveryRpcClient))
        await manager.pauseNeighbor(neighbor1, 'test')
        await manager.pauseNeighbor(neighbor2, 'test')
        await manager.pauseNeighbor(neighbor3, 'test')
        expect(manager.isNeighborPaused(neighbor1, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor2, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor3, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor4, 'test')).toBe(false)
        neighbors.remove(toNodeId(neighbor4))
        await until(() => manager.isNeighborPaused(neighbor1, 'test') === false)
        expect(manager.isNeighborPaused(neighbor2, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor3, 'test')).toBe(true)  
    })

})


