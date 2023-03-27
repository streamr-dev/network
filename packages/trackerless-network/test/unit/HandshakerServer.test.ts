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
    let respondWithAccepted: jest.Mock
    let respondWithUnaccepted: jest.Mock
    let respondWithInterleaveRequest: jest.Mock
    let interleaveHandshake: jest.Mock

    beforeEach(() => {
        targetNeighbors = new PeerList(peerId, 10)
        ongoingHandshakes = new Set()

        respondWithAccepted = jest.fn()
        respondWithUnaccepted = jest.fn()
        respondWithInterleaveRequest = jest.fn()
        interleaveHandshake = jest.fn()

        handshakerServer = new HandshakerServer({
            randomGraphId: 'random-graph',
            connectionLocker: mockConnectionLocker,
            ongoingHandshakes,
            respondWithAccepted,
            respondWithUnaccepted,
            respondWithInterleaveRequest,
            interleaveHandshake: async () => {
                interleaveHandshake()
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
        expect(respondWithAccepted).toHaveBeenCalledTimes(1)
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
        expect(respondWithInterleaveRequest).toHaveBeenCalledTimes(1)
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
        expect(respondWithUnaccepted).toHaveBeenCalledTimes(1)
    })

    it('interleaveHandshake success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            interleaveTarget: {
                kademliaId: PeerID.fromString('interleaveTarget').value,
                type: 0
            }

        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(interleaveHandshake).toHaveBeenCalledTimes(1)
    })

    it('interleaveHandshake success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'wrong-random-graph',
            senderId: 'senderId',
            interleaveTarget: {
                kademliaId: PeerID.fromString('interleaveTarget').value,
                type: 0
            }

        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(interleaveHandshake).toHaveBeenCalledTimes(0)
    })

})
