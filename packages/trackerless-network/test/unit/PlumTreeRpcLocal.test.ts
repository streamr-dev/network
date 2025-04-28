import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { PlumTreeRpcLocal } from '../../src/logic/plumtree/PlumTreeRpcLocal'
import { createMockPeerDescriptor } from '../utils/utils'
import { NodeList } from '../../src/logic/NodeList'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { MockTransport } from '../utils/mock/MockTransport'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'

describe('PlumTreeRpcLocal', () => {

    let rpcLocal: PlumTreeRpcLocal
    let localPeerDescriptor: PeerDescriptor
    let rpcCommunicator: ListeningRpcCommunicator
    let pausedNodes: Set<DhtAddress>
    let neighbors: NodeList
    let onMetadata: jest.Mock
    let sendBuffer: jest.Mock

    beforeEach(() => {
        localPeerDescriptor = createMockPeerDescriptor()
        rpcCommunicator = new ListeningRpcCommunicator('plumtree', new MockTransport())
        neighbors = new NodeList(toNodeId(localPeerDescriptor), 4)
        pausedNodes = new Set()
        onMetadata = jest.fn()
        sendBuffer = jest.fn()
        rpcLocal = new PlumTreeRpcLocal(
            neighbors,
            pausedNodes,
            onMetadata,
            sendBuffer
        )
    })

    it('pause neighbor', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        rpcLocal.pauseNeighbor({}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(true)
    })

    it('pause neighbor neiighor not in neighbors', () => {
        const neighbor = createMockPeerDescriptor()
        rpcLocal.pauseNeighbor({}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(false)
    })

    it('resume neighbor', () => {
        const neighbor = createMockPeerDescriptor()
        neighbors.add(new ContentDeliveryRpcRemote(localPeerDescriptor, neighbor, rpcCommunicator, ContentDeliveryRpcClient))
        rpcLocal.pauseNeighbor({}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(true)
        rpcLocal.resumeNeighbor({ fromTimestamp: 0}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(false)
    })

    it('send metadata', () => {
        const neighbor = createMockPeerDescriptor()
        rpcLocal.sendMetadata({} as any, { incomingSourceDescriptor: neighbor } as any)
        expect(onMetadata).toHaveBeenCalled()
    })
})
