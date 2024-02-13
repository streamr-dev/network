import { DhtAddress, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NeighborFinder } from '../../src/logic/neighbor-discovery/NeighborFinder'
import { NeighborUpdateRpcLocal } from '../../src/logic/neighbor-discovery/NeighborUpdateRpcLocal'
import { createMockPeerDescriptor } from '../utils/utils'
import { NodeList } from '../../src/logic/NodeList'
import { StreamPartIDUtils } from '@streamr/protocol'
import { MockTransport } from '../utils/mock/Transport'
import { DeliveryRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { DeliveryRpcRemote } from '../../src/logic/DeliveryRpcRemote'
import { range } from 'lodash'

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
            neighbors.add(new DeliveryRpcRemote(
                localPeerDescriptor,
                createMockPeerDescriptor(),
                rpcCommunicator,
                DeliveryRpcClient
            ))
        }
    }

    beforeEach(() => {
        rpcCommunicator = new ListeningRpcCommunicator('mock', new MockTransport())
        neighbors = new NodeList(getNodeIdFromPeerDescriptor(localPeerDescriptor), neighborTargetCount + 1)
        nearbyNodeView = new NodeList(getNodeIdFromPeerDescriptor(localPeerDescriptor), neighborTargetCount)
        neighborFinder = {
            start: jest.fn()
        } as any
        const connectionLocker = {
            weakUnlockConnection: jest.fn()
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
            connectionLocker,
            ongoingHandshakes
        })
    })

    afterEach(() => {
        rpcCommunicator.destroy()
    })

    it('response contains neighbor list of expected size', async () => {
        addNeighbors(neighborTargetCount)
        const res = await rpcLocal.neighborUpdate({
            streamPartId,
            neighborDescriptors: [localPeerDescriptor],
            removeMe: false
        }, { incomingSourceDescriptor: createMockPeerDescriptor() } as any)
        expect(res.neighborDescriptors.length).toEqual(neighborTargetCount)
    })

    it('updates contacts based on callers neighbors', async () => {
        addNeighbors(neighborTargetCount)
        expect(nearbyNodeView.size()).toEqual(0)
        await rpcLocal.neighborUpdate({
            streamPartId,
            neighborDescriptors: range(neighborTargetCount).map(() => createMockPeerDescriptor()),
            removeMe: false
        }, { incomingSourceDescriptor: createMockPeerDescriptor() } as any)
        expect(nearbyNodeView.size()).toEqual(4)
    })

    it('does not ask to be removed if caller is a neighbor', async () => {
        const caller = createMockPeerDescriptor()
        const neighbor = new DeliveryRpcRemote(
            localPeerDescriptor,
            caller,
            rpcCommunicator,
            DeliveryRpcClient
        )
        neighbors.add(neighbor)
        const res = await rpcLocal.neighborUpdate({
            streamPartId,
            neighborDescriptors: [localPeerDescriptor],
            removeMe: false
        }, { incomingSourceDescriptor: caller } as any)
        expect(res.removeMe).toEqual(false)
    })

    it('asks to be removed if caller is not a neighbor', async () => {
        const caller = createMockPeerDescriptor()
        const res = await rpcLocal.neighborUpdate({
            streamPartId,
            neighborDescriptors: [localPeerDescriptor],
            removeMe: false
        }, { incomingSourceDescriptor: caller } as any)
        expect(res.removeMe).toEqual(true)
    })

    it('asks to be removed if caller is a neighbor and both have too many neighbors', async () => {
        const caller = createMockPeerDescriptor()
        const neighbor = new DeliveryRpcRemote(
            localPeerDescriptor,
            caller,
            rpcCommunicator,
            DeliveryRpcClient
        )
        neighbors.add(neighbor)
        addNeighbors(neighborTargetCount)
        const res = await rpcLocal.neighborUpdate({
            streamPartId,
            neighborDescriptors: [localPeerDescriptor, ...range(neighborTargetCount).map(() => createMockPeerDescriptor())],
            removeMe: false
        }, { incomingSourceDescriptor: caller } as any)
        expect(res.removeMe).toEqual(true)
        expect(neighbors.has(getNodeIdFromPeerDescriptor(caller))).toEqual(false)
    })

    it('does not ask to be removed if there is an ongoing handshake to the caller', async () => {
        const caller = createMockPeerDescriptor()
        ongoingHandshakes.add(getNodeIdFromPeerDescriptor(caller))
        const res = await rpcLocal.neighborUpdate({
            streamPartId,
            neighborDescriptors: [localPeerDescriptor],
            removeMe: false
        }, { incomingSourceDescriptor: caller } as any)
        expect(res.removeMe).toEqual(false)
    })

})
