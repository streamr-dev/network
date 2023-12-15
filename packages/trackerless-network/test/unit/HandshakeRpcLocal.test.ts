import { NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { HandshakeRpcLocal } from '../../src/logic/neighbor-discovery/HandshakeRpcLocal'
import { InterleaveRequest, StreamPartHandshakeRequest } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor, createMockHandshakeRpcRemote, createMockDeliveryRpcRemote, mockConnectionLocker } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('HandshakeRpcLocal', () => {

    let rpcLocal: HandshakeRpcLocal

    const localPeerDescriptor = createMockPeerDescriptor()

    let targetNeighbors: NodeList
    let ongoingHandshakes: Set<NodeID>
    let ongoingInterleaves: Set<NodeID>
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        targetNeighbors = new NodeList(getNodeIdFromPeerDescriptor(localPeerDescriptor), 10)
        ongoingHandshakes = new Set()
        ongoingInterleaves = new Set()
        handshakeWithInterleaving = jest.fn()

        rpcLocal = new HandshakeRpcLocal({
            streamPartId: STREAM_PART_ID,
            connectionLocker: mockConnectionLocker,
            ongoingHandshakes,
            ongoingInterleaves,
            createRpcRemote: (_p) => createMockHandshakeRpcRemote(),
            createDeliveryRpcRemote: (_p) => createMockDeliveryRpcRemote(),
            handshakeWithInterleaving: async (_p, _t) => {
                handshakeWithInterleaving()
                return true
            },
            targetNeighbors,
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
        targetNeighbors.add(createMockDeliveryRpcRemote())
        targetNeighbors.add(createMockDeliveryRpcRemote())
        targetNeighbors.add(createMockDeliveryRpcRemote())
        targetNeighbors.add(createMockDeliveryRpcRemote())
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
        ongoingHandshakes.add('0x2222' as NodeID)
        ongoingHandshakes.add('0x3333' as NodeID)
        ongoingHandshakes.add('0x4444' as NodeID)
        ongoingHandshakes.add('0x5555' as NodeID)
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
                nodeId: hexToBinary('0x2222'),
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
                nodeId: hexToBinary('0x2222'),
                type: NodeType.NODEJS
            }
        }
        await rpcLocal.interleaveRequest(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('rejects handshakes if interleaving to the requestor is ongoing', async () => {
        targetNeighbors.add(createMockDeliveryRpcRemote())
        targetNeighbors.add(createMockDeliveryRpcRemote())
        targetNeighbors.add(createMockDeliveryRpcRemote())
        targetNeighbors.add(createMockDeliveryRpcRemote())
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
        targetNeighbors.add(createMockDeliveryRpcRemote(interleavingPeer1))
        targetNeighbors.add(createMockDeliveryRpcRemote(interleavingPeer2))
        targetNeighbors.add(createMockDeliveryRpcRemote(interleavingPeer3))
        targetNeighbors.add(createMockDeliveryRpcRemote())
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

})
