import { PeerID } from "@streamr/dht"
import { HandshakerServer } from "../../src/logic/neighbor-discovery/HandshakerServer"
import { PeerList } from "../../src/logic/PeerList"
import { InterleaveNotice, StreamHandshakeRequest } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { createMockRemoteHandshaker, createMockRemotePeer, mockConnectionLocker } from '../utils/utils'

describe('HandshakerServer', () => {

    let handshakerServer: HandshakerServer

    const peerId = PeerID.fromString('Handshaker')
    const ownPeerDescriptor = {
        kademliaId: peerId.value,
        type: 0
    }

    let targetNeighbors: PeerList
    let ongoingHandshakes: Set<string>
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        targetNeighbors = new PeerList(peerId, 10)
        ongoingHandshakes = new Set()

        handshakeWithInterleaving = jest.fn()

        handshakerServer = new HandshakerServer({
            randomGraphId: 'random-graph',
            ownPeerDescriptor,
            connectionLocker: mockConnectionLocker,
            ongoingHandshakes,
            createRemoteHandshaker: (_p) => createMockRemoteHandshaker(),
            createRemoteNode: (_p) => createMockRemotePeer(),
            handshakeWithInterleaving: async (_p, _t) => {
                handshakeWithInterleaving()
                return true
            },
            targetNeighbors,
            N: 4
        })
    })

    it('handshake', async () => {
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            requestId: 'requestId',
            senderDescriptor: {
                kademliaId: PeerID.fromString('senderId').value,
                type: 0
            }
        })
        const res = await handshakerServer.handshake(req, {} as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTarget).toBeUndefined()
        expect(res.requestId).toEqual('requestId')
    })

    it('handshake interleave', async () => {
        targetNeighbors.add(createMockRemotePeer())
        targetNeighbors.add(createMockRemotePeer())
        targetNeighbors.add(createMockRemotePeer())
        targetNeighbors.add(createMockRemotePeer())
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            requestId: 'requestId',
            senderDescriptor: {
                kademliaId: PeerID.fromString('senderId').value,
                type: 0
            }
        })
        const res = await handshakerServer.handshake(req, {} as any)
        expect(res.accepted).toEqual(true)
        expect(res.interleaveTarget).toBeDefined()
    })

    it('unaccepted handshake', async () => {
        ongoingHandshakes.add('mock1')
        ongoingHandshakes.add('mock2')
        ongoingHandshakes.add('mock3')
        ongoingHandshakes.add('mock4')
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            requestId: 'requestId',
            senderDescriptor: {
                kademliaId: PeerID.fromString('senderId').value,
                type: 0
            }
        })
        const res = await handshakerServer.handshake(req, {} as any)
        expect(res.accepted).toEqual(false)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            interleaveTarget: {
                kademliaId: PeerID.fromString('interleaveTarget').value,
                type: 0
            }

        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(1)
    })

    it('handshakeWithInterleaving success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'wrong-random-graph',
            senderId: 'senderId',
            interleaveTarget: {
                kademliaId: PeerID.fromString('interleaveTarget').value,
                type: 0
            }
        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(handshakeWithInterleaving).toHaveBeenCalledTimes(0)
    })

})
