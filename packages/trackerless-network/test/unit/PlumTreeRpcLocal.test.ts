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

    it('pause neighbor', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(true)
    })

    it('pause neighbor neighor not in neighbors', async () => {
        const neighbor = createMockPeerDescriptor()
        await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(false)
    })

    it('resume neighbor', async () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        await rpcLocal.pauseNeighbor({ messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(true)
        rpcLocal.resumeNeighbor({ fromTimestamp: 0, messageChainId: 'test' }, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.isPaused(toNodeId(neighbor), 'test')).toBe(false)
    })

    it('send metadata', async () => {
        const neighbor = createMockPeerDescriptor()
        await rpcLocal.sendMetadata({ messageChainId: 'test' } as any, { incomingSourceDescriptor: neighbor } as any)
        expect(onMetadata).toHaveBeenCalled()
    })
})
