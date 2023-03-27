import { PeerID } from "@streamr/dht"
import { HandshakerServer } from "../../src/logic/neighbor-discovery/HandshakerServer"
import { PeerList } from "../../src/logic/PeerList"
import { InterleaveNotice, StreamHandshakeRequest } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { createMockRemotePeer, mockConnectionLocker } from '../utils/utils'

describe('HandshakerServer', () => {

    let handshakerServer: HandshakerServer

    const peerId = PeerID.fromString('Handshaker')

    let targetNeighbors: PeerList
    let ongoingHandshakes: Set<string>
    let acceptHandshake: jest.Mock
    let rejectHandshake: jest.Mock
    let acceptHandshakeWithInterleaving: jest.Mock
    let handshakeWithInterleaving: jest.Mock

    beforeEach(() => {
        targetNeighbors = new PeerList(peerId, 10)
        ongoingHandshakes = new Set()

        acceptHandshake = jest.fn()
        rejectHandshake = jest.fn()
        acceptHandshakeWithInterleaving = jest.fn()
        handshakeWithInterleaving = jest.fn()

        handshakerServer = new HandshakerServer({
            randomGraphId: 'random-graph',
            connectionLocker: mockConnectionLocker,
            ongoingHandshakes,
            acceptHandshake,
            rejectHandshake,
            acceptHandshakeWithInterleaving,
            handshakeWithInterleaving: async () => {
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
        await handshakerServer.handshake(req, {} as any)
        expect(acceptHandshake).toHaveBeenCalledTimes(1)
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
        await handshakerServer.handshake(req, {} as any)
        expect(acceptHandshakeWithInterleaving).toHaveBeenCalledTimes(1)
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
        await handshakerServer.handshake(req, {} as any)
        expect(rejectHandshake).toHaveBeenCalledTimes(1)
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
