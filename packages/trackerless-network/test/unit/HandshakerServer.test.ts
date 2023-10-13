import { NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { HandshakerServer } from '../../src/logic/neighbor-discovery/HandshakerServer'
import { InterleaveNotice, StreamPartHandshakeRequest } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor, createMockRemoteHandshaker, createMockRemoteNode, mockConnectionLocker } from '../utils/utils'

describe('HandshakerServer', () => {

    let handshakerServer: HandshakerServer

    const ownPeerDescriptor = createMockPeerDescriptor()

    let targetNeighbors: NodeList
    let ongoingHandshakes: Set<NodeID>
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        targetNeighbors = new NodeList(getNodeIdFromPeerDescriptor(ownPeerDescriptor), 10)
        ongoingHandshakes = new Set()

        handshakeWithInterleaving = jest.fn()

        handshakerServer = new HandshakerServer({
            randomGraphId: 'random-graph',
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
        const req = StreamPartHandshakeRequest.create({
            randomGraphId: 'random-graph',
            requestId: 'requestId'
        })
        const res = await handshakerServer.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTargetDescriptor).toBeUndefined()
        expect(res.requestId).toEqual('requestId')
    })

    it('handshake interleave', async () => {
        targetNeighbors.add(createMockRemoteNode())
        targetNeighbors.add(createMockRemoteNode())
        targetNeighbors.add(createMockRemoteNode())
        targetNeighbors.add(createMockRemoteNode())
        const req = StreamPartHandshakeRequest.create({
            randomGraphId: 'random-graph',
            requestId: 'requestId'
        })
        const res = await handshakerServer.handshake(req, {
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
            randomGraphId: 'random-graph',
            requestId: 'requestId'
        })
        const res = await handshakerServer.handshake(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(res.accepted).toEqual(false)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'random-graph',
            interleaveTargetDescriptor: {
                kademliaId: hexToBinary('0x2222'),
                type: NodeType.NODEJS
            }

        }
        await handshakerServer.interleaveNotice(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'wrong-random-graph',
            interleaveTargetDescriptor: {
                kademliaId: hexToBinary('0x2222'),
                type: NodeType.NODEJS
            }
        }
        await handshakerServer.interleaveNotice(req, {
            incomingSourceDescriptor: createMockPeerDescriptor()
        } as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(0)
    })

})
