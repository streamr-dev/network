import { NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { HandshakeRpcLocal } from '../../src/logic/neighbor-discovery/HandshakeRpcLocal'
import { InterleaveNotice, StreamPartHandshakeRequest } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor, createMockHandshakeRpcRemote, createMockDeliveryRpcRemote, mockConnectionLocker } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('HandshakeRpcLocal', () => {

    let rpcLocal: HandshakeRpcLocal

    const localPeerDescriptor = createMockPeerDescriptor()

    let targetNeighbors: NodeList
    let ongoingHandshakes: Set<NodeID>
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        targetNeighbors = new NodeList(getNodeIdFromPeerDescriptor(localPeerDescriptor), 10)
        ongoingHandshakes = new Set()

        handshakeWithInterleaving = jest.fn()

        rpcLocal = new HandshakeRpcLocal({
            streamPartId: STREAM_PART_ID,
            connectionLocker: mockConnectionLocker,
            ongoingHandshakes,
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
        const req: InterleaveNotice = {
            streamPartId: STREAM_PART_ID,
            interleaveTargetDescriptor: {
                nodeId: hexToBinary('0x2222'),
                type: NodeType.NODEJS
            }

        }
        await rpcLocal.interleaveNotice(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            streamPartId: StreamPartIDUtils.parse('other-stream#0'),
            interleaveTargetDescriptor: {
                nodeId: hexToBinary('0x2222'),
                type: NodeType.NODEJS
            }
        }
        await rpcLocal.interleaveNotice(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(0)
    })

})
