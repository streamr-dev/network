import { HandshakerServer } from '../../src/logic/neighbor-discovery/HandshakerServer'
import { NodeList } from '../../src/logic/NodeList'
import { InterleaveNotice, StreamHandshakeRequest } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockRemoteHandshaker, createMockRemoteNode, createRandomNodeId, mockConnectionLocker } from '../utils/utils'
import { NodeID } from '../../src/identifiers'
import { hexToBinary } from '@streamr/utils'

describe('HandshakerServer', () => {

    let handshakerServer: HandshakerServer

    const nodeId = createRandomNodeId()
    const ownPeerDescriptor = {
        kademliaId: hexToBinary(nodeId),
        type: 0
    }

    let targetNeighbors: NodeList
    let ongoingHandshakes: Set<NodeID>
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        targetNeighbors = new NodeList(nodeId, 10)
        ongoingHandshakes = new Set()

        handshakeWithInterleaving = jest.fn()

        handshakerServer = new HandshakerServer({
            randomGraphId: 'random-graph',
            ownPeerDescriptor,
            connectionLocker: mockConnectionLocker,
            ongoingHandshakes,
            createRemoteHandshaker: (_p) => createMockRemoteHandshaker(),
            createRemoteNode: (_p) => createMockRemoteNode(),
            handshakeWithInterleaving: async (_p, _t) => {
                handshakeWithInterleaving()
                return true
            },
            targetNeighbors,
            N: 4
        })
    })

    it('handshake', async () => {
        const senderId = hexToBinary('0x1111')
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId,
            requestId: 'requestId',
            senderDescriptor: {
                kademliaId: senderId,
                type: 0
            }
        })
        const res = await handshakerServer.handshake(req, {} as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTargetDescriptor).toBeUndefined()
        expect(res.requestId).toEqual('requestId')
    })

    it('handshake interleave', async () => {
        const senderId = hexToBinary('0x1111')
        targetNeighbors.add(createMockRemoteNode())
        targetNeighbors.add(createMockRemoteNode())
        targetNeighbors.add(createMockRemoteNode())
        targetNeighbors.add(createMockRemoteNode())
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId,
            requestId: 'requestId',
            senderDescriptor: {
                kademliaId: senderId,
                type: 0
            }
        })
        const res = await handshakerServer.handshake(req, {} as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTargetDescriptor).toBeDefined()
    })

    it('unaccepted handshake', async () => {
        const senderId = hexToBinary('0x1111')
        ongoingHandshakes.add('0x2222' as NodeID)
        ongoingHandshakes.add('0x3333' as NodeID)
        ongoingHandshakes.add('0x4444' as NodeID)
        ongoingHandshakes.add('0x5555' as NodeID)
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId,
            requestId: 'requestId',
            senderDescriptor: {
                kademliaId: senderId,
                type: 0
            }
        })
        const res = await handshakerServer.handshake(req, {} as any)
        expect(res.accepted).toEqual(false)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'random-graph',
            senderId: hexToBinary('0x1111'),
            interleaveTargetDescriptor: {
                kademliaId: hexToBinary('0x2222'),
                type: 0
            }

        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'wrong-random-graph',
            senderId: hexToBinary('0x1111'),
            interleaveTargetDescriptor: {
                kademliaId: hexToBinary('0x2222'),
                type: 0
            }
        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(0)
    })

})
