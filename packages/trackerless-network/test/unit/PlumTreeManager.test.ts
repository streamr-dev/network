import { ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { NodeList } from '../../src/content-delivery-layer/NodeList'
import { PlumtreeManager } from '../../src/content-delivery-layer/plumtree/PlumtreeManager'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { MockTransport } from '../utils/mock/MockTransport'
import { StreamPartIDUtils, until, wait } from '@streamr/utils'
import { randomUserId } from '@streamr/test-utils'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { ContentDeliveryRpcRemote } from '../../src/content-delivery-layer/ContentDeliveryRpcRemote'

describe('PlumtreeManager', () => {

    let manager: PlumtreeManager
    let neighbors: NodeList
    let localPeerDescriptor: PeerDescriptor
    let rpcCommunicator: ListeningRpcCommunicator

    beforeEach(() => {
        localPeerDescriptor = createMockPeerDescriptor()
        neighbors = new NodeList(toNodeId(localPeerDescriptor), 4)
        rpcCommunicator = new ListeningRpcCommunicator('plumtree', new MockTransport())
        manager = new PlumtreeManager({
            neighbors,
            localPeerDescriptor,
            rpcCommunicator,
            recoveryCheckInterval: 50,
            recoveryTimeout: 100,
            recoveryCooldown: 200
        })
    })

    afterEach(() => {
        manager.stop()
    })

    it('tracks local paused state via remotePausedNeighbors', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        manager.getRemotePausedNeighbors().delete(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('tracks local paused state via localPausedNeighbors', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        manager.getLocalPausedNeighbors().add(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        manager.getLocalPausedNeighbors().delete(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('should not pause neighbors that are not in the neighbors list', async () => {
        const neighbor = createMockPeerDescriptor()
        await manager.pauseNeighbor(neighbor, 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('should pause based on message chain id', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor, 'test2')).toBe(false)
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor), 'test2')
        expect(manager.isNeighborPaused(neighbor, 'test2')).toBe(true)
        manager.getRemotePausedNeighbors().delete(toNodeId(neighbor), 'test2')
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
        manager.getLocalPausedNeighbors().add(toNodeId(neighbor), msg.messageId!.messageChainId)
        expect(manager.isNeighborPaused(neighbor, msg.messageId!.messageChainId)).toBe(true)
        manager.on('message', (received) => {
            expect(received.messageId!.messageChainId).toBe(msg.messageId!.messageChainId)
        })
        manager.broadcast(msg, toNodeId(neighbor))
        expect(manager.isNeighborPaused(neighbor, msg.messageId!.messageChainId)).toBe(true)
        await wait(100)
    })

    it('removes paused node if neighbor is removed', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        neighbors.remove(toNodeId(neighbor))
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(false)
    })

    it('if neighbor is removed and it leads to all neighbors being paused, it resumes the first neighbor', async () => {
        const neighbor1 = createMockPeerDescriptor()
        const neighbor2 = createMockPeerDescriptor()
        const neighbor3 = createMockPeerDescriptor()
        const neighbor4 = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor1, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor2, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor3, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor4, rpcCommunicator, ContentDeliveryRpcClient))
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor1), 'test')
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor2), 'test')
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor3), 'test')
        expect(manager.isNeighborPaused(neighbor1, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor2, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor3, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor4, 'test')).toBe(false)
        neighbors.remove(toNodeId(neighbor4))
        await until(() => manager.isNeighborPaused(neighbor1, 'test') === false)
        expect(manager.isNeighborPaused(neighbor2, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor3, 'test')).toBe(true)  
    })

    it('cannot pause more than 3 neighbors via remotePausedNeighbors', () => {
        const neighbor1 = createMockPeerDescriptor()
        const neighbor2 = createMockPeerDescriptor()
        const neighbor3 = createMockPeerDescriptor()
        const neighbor4 = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor1, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor2, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor3, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor4, rpcCommunicator, ContentDeliveryRpcClient))
        expect(manager.getRemotePausedNeighbors().add(toNodeId(neighbor1), 'test')).toBe(true)
        expect(manager.getRemotePausedNeighbors().add(toNodeId(neighbor2), 'test')).toBe(true)
        expect(manager.getRemotePausedNeighbors().add(toNodeId(neighbor3), 'test')).toBe(true)
        expect(manager.getRemotePausedNeighbors().add(toNodeId(neighbor4), 'test')).toBe(false)
        expect(manager.isNeighborPaused(neighbor1, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor2, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor3, 'test')).toBe(true)
        expect(manager.isNeighborPaused(neighbor4, 'test')).toBe(false)
    })

    it('stop() properly cleans up listener', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor), 'test')
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
        manager.stop()
        neighbors.remove(toNodeId(neighbor))
        expect(manager.isNeighborPaused(neighbor, 'test')).toBe(true)
    })

    it('onNeighborRemoved cleans up recovery state candidates', () => {
        const neighbor1 = createMockPeerDescriptor()
        const neighbor2 = createMockPeerDescriptor()
        const publisher = randomUserId()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor1, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor2, rpcCommunicator, ContentDeliveryRpcClient))
        const msg1 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), publisher, 100)
        manager.broadcast(msg1, toNodeId(neighbor1))
        manager.getRemotePausedNeighbors().add(toNodeId(neighbor1), msg1.messageId!.messageChainId)
        neighbors.remove(toNodeId(neighbor1))
        expect(manager.isNeighborPaused(neighbor1, msg1.messageId!.messageChainId)).toBe(false)
    })

    it('broadcast clears recovery state when real data arrives', () => {
        const neighbor = createMockPeerDescriptor()
        const publisher = randomUserId()
        const chainId = `messageChain0-${publisher}`
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        const msg1 = createStreamMessage('test', StreamPartIDUtils.parse('test#0'), publisher, 100)
        manager.broadcast(msg1, toNodeId(neighbor))
        const msg2 = createStreamMessage('test2', StreamPartIDUtils.parse('test#0'), publisher, 200)
        manager.broadcast(msg2, toNodeId(neighbor))
        expect(manager.getLatestMessageTimestamp(chainId)).toBe(200)
    })
})
