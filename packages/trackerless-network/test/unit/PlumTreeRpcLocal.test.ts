import { DhtAddress, toNodeId } from '@streamr/dht'
import { PlumTreeRpcLocal } from '../../src/logic/plumtree/PlumTreeRpcLocal'
import { createMockPeerDescriptor } from '../utils/utils'

describe('PlumTreeRpcLocal', () => {

    let rpcLocal: PlumTreeRpcLocal

    let pausedNodes: Set<DhtAddress>
    let onMetadata: jest.Mock
    let sendBuffer: jest.Mock

    beforeEach(() => {
        pausedNodes = new Set()
        onMetadata = jest.fn()
        sendBuffer = jest.fn()
        rpcLocal = new PlumTreeRpcLocal(
            pausedNodes,
            onMetadata,
            sendBuffer
        )
    })

    it('pause neighbor', () => {
        const neighbor = createMockPeerDescriptor()
        rpcLocal.pauseNeighbor({}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(true)
    })

    it('resume neighbor', () => {
        const neighbor = createMockPeerDescriptor()
        rpcLocal.pauseNeighbor({}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(true)
        rpcLocal.resumeNeighbor({}, { incomingSourceDescriptor: neighbor } as any)
        expect(pausedNodes.has(toNodeId(neighbor))).toBe(false)
    })

    it('send metadata', () => {
        const neighbor = createMockPeerDescriptor()
        rpcLocal.sendMetadata({} as any, { incomingSourceDescriptor: neighbor } as any)
        expect(onMetadata).toHaveBeenCalled()
    })
})
