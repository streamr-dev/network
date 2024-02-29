import { DhtAddress, NodeType, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '@streamr/dht'
import { NodeList } from '../../src/logic/NodeList'
import { HandshakeRpcLocal } from '../../src/logic/neighbor-discovery/HandshakeRpcLocal'
import { InterleaveRequest, StreamPartHandshakeRequest } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor, createMockHandshakeRpcRemote, createMockDeliveryRpcRemote } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('HandshakeRpcLocal', () => {

    let rpcLocal: HandshakeRpcLocal

    const localPeerDescriptor = createMockPeerDescriptor()

    let neighbors: NodeList
    let ongoingHandshakes: Set<DhtAddress>
    let ongoingInterleaves: Set<DhtAddress>
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        neighbors = new NodeList(getNodeIdFromPeerDescriptor(localPeerDescriptor), 10)
        ongoingHandshakes = new Set()
        ongoingInterleaves = new Set()
        handshakeWithInterleaving = jest.fn()

        rpcLocal = new HandshakeRpcLocal({
            streamPartId: STREAM_PART_ID,
            ongoingHandshakes,
            ongoingInterleaves,
            createRpcRemote: (_p) => createMockHandshakeRpcRemote(),
            createDeliveryRpcRemote: (_p) => createMockDeliveryRpcRemote(),
            handshakeWithInterleaving: async (_p, _t) => {
                handshakeWithInterleaving()
                return true
            },
            neighbors,
            maxNeighborCount: 4
        })
    })

    it('handshake', async () => {
        const req = StreamPartHandshakeRequest.create({
            streamPartId: STREAM_PART_ID,
            requestId: 'requestId'
        })
        const res = await rpcLocal.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTargetDescriptor).toBeUndefined()
        expect(res.requestId).toEqual('requestId')
    })

    it('handshake interleave', async () => {
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        const req = StreamPartHandshakeRequest.create({
            streamPartId: STREAM_PART_ID,
            requestId: 'requestId'
        })
        const res = await rpcLocal.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTargetDescriptor).toBeDefined()
    })

    it('unaccepted handshake', async () => {
        ongoingHandshakes.add('0x2222' as DhtAddress)
        ongoingHandshakes.add('0x3333' as DhtAddress)
        ongoingHandshakes.add('0x4444' as DhtAddress)
        ongoingHandshakes.add('0x5555' as DhtAddress)
        const req = StreamPartHandshakeRequest.create({
            streamPartId: STREAM_PART_ID,
            requestId: 'requestId'
        })
        const res = await rpcLocal.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(false)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveRequest = {
            interleaveTargetDescriptor: {
                nodeId: getRawFromDhtAddress('0x2222' as DhtAddress),
                type: NodeType.NODEJS
            }
        }
        await rpcLocal.interleaveRequest(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveRequest = {
            interleaveTargetDescriptor: {
                nodeId: getRawFromDhtAddress('0x2222' as DhtAddress),
                type: NodeType.NODEJS
            }
        }
        await rpcLocal.interleaveRequest(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('rejects handshakes if interleaving to the requestor is ongoing', async () => {
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        const requestor = createMockPeerDescriptor()
        ongoingInterleaves.add(getNodeIdFromPeerDescriptor(requestor))
        const req = StreamPartHandshakeRequest.create({
            streamPartId: STREAM_PART_ID,
            requestId: 'requestId'
        })
        const res = await rpcLocal.handshake(req, {
            incomingSourceDescriptor: requestor
        } as any)
        expect(res.accepted).toEqual(false)
    })

    it('Rejects if interleaving is required and too many interleaving requests are ongoing', async () => {
        const interleavingPeer1 = createMockPeerDescriptor()
        const interleavingPeer2 = createMockPeerDescriptor()
        const interleavingPeer3 = createMockPeerDescriptor()
        neighbors.add(createMockDeliveryRpcRemote(interleavingPeer1))
        neighbors.add(createMockDeliveryRpcRemote(interleavingPeer2))
        neighbors.add(createMockDeliveryRpcRemote(interleavingPeer3))
        neighbors.add(createMockDeliveryRpcRemote())
        ongoingInterleaves.add(getNodeIdFromPeerDescriptor(interleavingPeer1))
        ongoingInterleaves.add(getNodeIdFromPeerDescriptor(interleavingPeer2))
        ongoingInterleaves.add(getNodeIdFromPeerDescriptor(interleavingPeer3))
        const req = StreamPartHandshakeRequest.create({
            streamPartId: STREAM_PART_ID,
            requestId: 'requestId'
        })
        const res = await rpcLocal.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(false)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(0)
    })

    it('rejects handshakes if the requestor has more than maxNeighborCount neighbors', async () => {
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        neighbors.add(createMockDeliveryRpcRemote())
        const req = StreamPartHandshakeRequest.create({
            streamPartId: STREAM_PART_ID,
            requestId: 'requestId'
        })
        const res = await rpcLocal.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(false)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(0)
    })

})
