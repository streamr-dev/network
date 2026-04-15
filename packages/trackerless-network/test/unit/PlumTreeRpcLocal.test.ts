import { ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { PlumtreeRpcLocal } from '../../src/content-delivery-layer/plumtree/PlumtreeRpcLocal'
import { createMockPeerDescriptor } from '../utils/utils'
import { NodeList } from '../../src/content-delivery-layer/NodeList'
import { ContentDeliveryRpcRemote } from '../../src/content-delivery-layer/ContentDeliveryRpcRemote'
import { MockTransport } from '../utils/mock/MockTransport'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { PausedNeighbors } from '../../src/content-delivery-layer/plumtree/PausedNeighbors'
import { MAX_PAUSED_NEIGHBORS_DEFAULT } from '../../src/content-delivery-layer/plumtree/PlumtreeManager'

describe('PlumtreeRpcLocal', () => {

    let rpcLocal: PlumtreeRpcLocal
    let localPeerDescriptor: PeerDescriptor
    let rpcCommunicator: ListeningRpcCommunicator
    let pausedNodes: PausedNeighbors
    let neighbors: NodeList
    let onMetadata: jest.Mock
    let sendBuffer: jest.Mock

    beforeEach(() => {
        localPeerDescriptor = createMockPeerDescriptor()
        rpcCommunicator = new ListeningRpcCommunicator('plumtree', new MockTransport())
        neighbors = new NodeList(toNodeId(localPeerDescriptor), 4)
        pausedNodes = new PausedNeighbors(MAX_PAUSED_NEIGHBORS_DEFAULT)
        onMetadata = jest.fn()
        sendBuffer = jest.fn()
        rpcLocal = new PlumtreeRpcLocal(
            neighbors,
            pausedNodes,
            onMetadata,
            sendBuffer
        )
    })

    it('pause neighbor returns accepted true', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        const response = await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(response.accepted).toBe(true)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(true)
    })

    it('pause neighbor returns accepted false when not in neighbors', async () => {
        const neighbor = createMockPeerDescriptor()
        const response = await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(response.accepted).toBe(false)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(false)
    })

    it('pause neighbor returns accepted false when limit reached', async () => {
        const neighbor1 = createMockPeerDescriptor()
        const neighbor2 = createMockPeerDescriptor()
        const neighbor3 = createMockPeerDescriptor()
        const neighbor4 = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor1, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor2, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor3, rpcCommunicator, ContentDeliveryRpcClient))
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor4, rpcCommunicator, ContentDeliveryRpcClient))
        const resp1 = await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor1 } as any)
        const resp2 = await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor2 } as any)
        const resp3 = await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor3 } as any)
        const resp4 = await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor4 } as any)
        expect(resp1.accepted).toBe(true)
        expect(resp2.accepted).toBe(true)
        expect(resp3.accepted).toBe(true)
        expect(resp4.accepted).toBe(false)
        expect(pausedNodes.isPaused(toNodeId(neighbor4), 'test')).toBe(false)
    })

    it('resume neighbor when in neighbors', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(true)
        await rpcLocal.resumeNeighbor({ fromTimestamp: 0, messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(false)
        expect(sendBuffer).toHaveBeenCalledWith(0, 'test', neighbor)
    })

    it('resume neighbor ignores non-neighbor', async () => {
        const neighbor = createMockPeerDescriptor()
        pausedNodes.add(toNodeId(neighbor), 'test')
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(true)
        await rpcLocal.resumeNeighbor({ fromTimestamp: 0, messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(true)
        expect(sendBuffer).not.toHaveBeenCalled()
    })

    it('send metadata', async () => {
        const neighbor = createMockPeerDescriptor()
        await rpcLocal.sendMetadata({ messageChainId: 'test' } as any, { incomingSourceDescriptor: neighbor } as any)
        expect(onMetadata).toHaveBeenCalled()
    })
})
