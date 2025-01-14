import { DhtAddress, ListeningRpcCommunicator, toNodeId } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { range } from 'lodash'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { NodeList } from '../../src/logic/NodeList'
import { NeighborFinder } from '../../src/logic/neighbor-discovery/NeighborFinder'
import { NeighborUpdateRpcLocal } from '../../src/logic/neighbor-discovery/NeighborUpdateRpcLocal'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'

describe('NeighborUpdateRpcLocal', () => {
    const streamPartId = StreamPartIDUtils.parse('stream#0')
    const localPeerDescriptor = createMockPeerDescriptor()
    const neighborTargetCount = 4

    let rpcLocal: NeighborUpdateRpcLocal
    let neighbors: NodeList
    let nearbyNodeView: NodeList
    let neighborFinder: NeighborFinder
    let rpcCommunicator: ListeningRpcCommunicator
    let ongoingHandshakes: Set<DhtAddress>

    const addNeighbors = (count: number) => {
        for (let i = 0; i < count; i++) {
            neighbors.add(
                new ContentDeliveryRpcRemote(
                    localPeerDescriptor,
                    createMockPeerDescriptor(),
                    rpcCommunicator,
                    ContentDeliveryRpcClient
                )
            )
        }
    }

    beforeEach(() => {
        rpcCommunicator = new ListeningRpcCommunicator('mock', new MockTransport())
        neighbors = new NodeList(toNodeId(localPeerDescriptor), neighborTargetCount + 1)
        nearbyNodeView = new NodeList(toNodeId(localPeerDescriptor), neighborTargetCount)
        neighborFinder = {
            start: jest.fn()
        } as any
        ongoingHandshakes = new Set()

        rpcLocal = new NeighborUpdateRpcLocal({
            localPeerDescriptor,
            neighbors,
            nearbyNodeView,
            neighborFinder,
            streamPartId,
            rpcCommunicator,
            neighborTargetCount,
            ongoingHandshakes
        })
    })

    afterEach(() => {
        rpcCommunicator.destroy()
    })

    it('response contains neighbor list of expected size', async () => {
        addNeighbors(neighborTargetCount)
        const res = await rpcLocal.neighborUpdate(
            {
                streamPartId,
                neighborDescriptors: [localPeerDescriptor],
                removeMe: false
            },
            { incomingSourceDescriptor: createMockPeerDescriptor() } as any
        )
        expect(res.neighborDescriptors.length).toEqual(neighborTargetCount)
    })

    it('updates contacts based on callers neighbors', async () => {
        addNeighbors(neighborTargetCount)
        expect(nearbyNodeView.size()).toEqual(0)
        await rpcLocal.neighborUpdate(
            {
                streamPartId,
                neighborDescriptors: range(neighborTargetCount).map(() => createMockPeerDescriptor()),
                removeMe: false
            },
            { incomingSourceDescriptor: createMockPeerDescriptor() } as any
        )
        expect(nearbyNodeView.size()).toEqual(4)
    })

    it('does not ask to be removed if caller is a neighbor', async () => {
        const caller = createMockPeerDescriptor()
        const neighbor = new ContentDeliveryRpcRemote(
            localPeerDescriptor,
            caller,
            rpcCommunicator,
            ContentDeliveryRpcClient
        )
        neighbors.add(neighbor)
        const res = await rpcLocal.neighborUpdate(
            {
                streamPartId,
                neighborDescriptors: [localPeerDescriptor],
                removeMe: false
            },
            { incomingSourceDescriptor: caller } as any
        )
        expect(res.removeMe).toEqual(false)
    })

    it('asks to be removed if caller is not a neighbor', async () => {
        const caller = createMockPeerDescriptor()
        const res = await rpcLocal.neighborUpdate(
            {
                streamPartId,
                neighborDescriptors: [localPeerDescriptor],
                removeMe: false
            },
            { incomingSourceDescriptor: caller } as any
        )
        expect(res.removeMe).toEqual(true)
    })

    it('asks to be removed if caller is a neighbor and both have too many neighbors', async () => {
        const caller = createMockPeerDescriptor()
        const neighbor = new ContentDeliveryRpcRemote(
            localPeerDescriptor,
            caller,
            rpcCommunicator,
            ContentDeliveryRpcClient
        )
        neighbors.add(neighbor)
        addNeighbors(neighborTargetCount)
        const res = await rpcLocal.neighborUpdate(
            {
                streamPartId,
                neighborDescriptors: [
                    localPeerDescriptor,
                    ...range(neighborTargetCount).map(() => createMockPeerDescriptor())
                ],
                removeMe: false
            },
            { incomingSourceDescriptor: caller } as any
        )
        expect(res.removeMe).toEqual(true)
        expect(neighbors.has(toNodeId(caller))).toEqual(false)
    })

    it('does not ask to be removed if there is an ongoing handshake to the caller', async () => {
        const caller = createMockPeerDescriptor()
        ongoingHandshakes.add(toNodeId(caller))
        const res = await rpcLocal.neighborUpdate(
            {
                streamPartId,
                neighborDescriptors: [localPeerDescriptor],
                removeMe: false
            },
            { incomingSourceDescriptor: caller } as any
        )
        expect(res.removeMe).toEqual(false)
    })
})
